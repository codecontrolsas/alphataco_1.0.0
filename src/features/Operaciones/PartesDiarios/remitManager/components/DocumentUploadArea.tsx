'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, FileIcon, Loader2, Upload, UploadCloud, X } from 'lucide-react';
import React from 'react';
import { useFileValidation, useUploadDocument } from '../hooks/useDocuments';
import { DocumentUploadAreaProps } from '../types';

export function DocumentUploadArea({ remitId, dailyReportRowId }: DocumentUploadAreaProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState('');

  const uploadDocument = useUploadDocument(dailyReportRowId);
  const { validateFile } = useFileValidation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setError('');
      return;
    }

    const validation = validateFile(selectedFile);
    if (!validation.isValid) {
      setError(validation.errors.join(', '));
      setFile(null);
      return;
    }

    setError('');
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      await uploadDocument.mutateAsync({ remitId, file });
      setFile(null);
      setError('');
      const input = document.getElementById('file-upload') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err) {
      setError('Error al subir el documento');
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setError('');
    const input = document.getElementById('file-upload') as HTMLInputElement;
    if (input) input.value = '';
  };

  return (
    <div className="space-y-4 p-5 border-2 border-dashed rounded-lg bg-muted/20">
      {!file ? (
        <div className="space-y-3">
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-full">
              <UploadCloud className="h-8 w-8 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Seleccione un archivo</p>
            <p className="text-xs text-muted-foreground">Formatos permitidos: PDF, JPG, PNG, WebP</p>
            <p className="text-xs text-muted-foreground">Tamaño máximo: 10MB</p>
          </div>

          <Input
            id="file-upload"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            disabled={uploadDocument.isPending}
            className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm file:font-medium hover:file:bg-primary/90"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-background rounded-lg border shadow-sm">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{file.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                  {file.type.split('/')[1].toUpperCase()}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={uploadDocument.isPending}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Button onClick={handleUpload} disabled={uploadDocument.isPending} size="lg" className="w-full">
            {uploadDocument.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Subiendo documento...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 mr-2" />
                Subir Documento
              </>
            )}
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
