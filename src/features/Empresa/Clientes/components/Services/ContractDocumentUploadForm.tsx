'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FileSpreadsheet, FileText, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import type React from 'react';
import { useRef, useState, type ChangeEvent } from 'react';

interface ContractDocumentUploadFormProps {
  selectedFiles: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (index: number) => void;
  docType: string;
  onDocTypeChange: (value: string) => void;
  docDescription: string;
  onDocDescriptionChange: (value: string) => void;
  isUploading: boolean;
  onUpload: () => void;
}

function FileIcon({ file }: { file: File }) {
  const name = file.name.toLowerCase();
  if (file.type.includes('pdf'))
    return <FileText aria-hidden="true" className="mr-2 h-4 w-4 text-danger-subtle-foreground" />;
  if (file.type.includes('image'))
    return <ImageIcon aria-hidden="true" className="mr-2 h-4 w-4 text-info-subtle-foreground" />;
  if (
    file.type.includes('excel') ||
    file.type.includes('spreadsheet') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  ) {
    return <FileSpreadsheet aria-hidden="true" className="mr-2 h-4 w-4 text-ok-subtle-foreground" />;
  }
  return null;
}

/** Formulario de subida de un documento de contrato: zona de arrastre, archivos elegidos, tipo y descripción. */
export function ContractDocumentUploadForm({
  selectedFiles,
  onFilesAdded,
  onFileRemoved,
  docType,
  onDocTypeChange,
  docDescription,
  onDocDescriptionChange,
  isUploading,
  onUpload,
}: ContractDocumentUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const openFileSelector = () => fileInputRef.current?.click();

  const addFiles = (files: FileList) => {
    onFilesAdded(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const stop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    stop(e);
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-4 text-lg font-medium">Subir Documento</h3>
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-lg border-2 p-6 text-center transition-colors',
            isDragging ? 'border-ok bg-ok-subtle' : 'border-dashed hover:bg-muted/50',
            isUploading && 'pointer-events-none opacity-50'
          )}
          onDragEnter={(e) => {
            stop(e);
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            stop(e);
            setIsDragging(false);
          }}
          onDragOver={stop}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <Loader2 aria-hidden="true" className="mx-auto mb-2 h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload aria-hidden="true" className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isUploading
              ? 'Subiendo archivos...'
              : isDragging
                ? 'Soltá los archivos acá'
                : 'Arrastrá y soltá archivos acá o'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={isUploading}
            onClick={openFileSelector}
          >
            Seleccionar archivos
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            multiple
            disabled={isUploading}
            aria-label="Seleccionar archivos del contrato"
          />
        </div>

        {selectedFiles.length > 0 && (
          <div className="rounded border bg-muted/50 p-3">
            <h4 className="mb-2 text-sm font-medium">Archivos seleccionados ({selectedFiles.length})</h4>
            <ul className="max-h-32 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between py-1 text-sm">
                  <span className="flex min-w-0 items-center">
                    <FileIcon file={file} />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-danger-subtle-foreground"
                    aria-label={`Quitar ${file.name}`}
                    onClick={() => onFileRemoved(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="docType">Tipo de documento</Label>
          <Input
            id="docType"
            type="text"
            placeholder="Tipo de documento"
            value={docType}
            onChange={(e) => onDocTypeChange(e.target.value)}
            disabled={isUploading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="docDescription">Descripción</Label>
          <Input
            id="docDescription"
            type="text"
            placeholder="Descripción breve del documento"
            value={docDescription}
            onChange={(e) => onDocDescriptionChange(e.target.value)}
            disabled={isUploading}
          />
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={onUpload}
          disabled={isUploading || selectedFiles.length === 0}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Subiendo...
            </>
          ) : (
            'Subir documento'
          )}
        </Button>
      </div>
    </div>
  );
}
