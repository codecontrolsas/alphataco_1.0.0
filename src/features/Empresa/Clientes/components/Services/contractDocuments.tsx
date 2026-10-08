'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileSpreadsheet, FileText, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import moment from 'moment';
import type React from 'react';
import { useRef, useState, type ChangeEvent } from 'react';
import {
  deleteContractDocument,
  getContractDocumentDownloadUrl,
  getContractDocuments,
  uploadContractDocument,
  type ContractDocument,
} from '../../actions/services.server';

const logger = new Logger('features/Empresa/Clientes/ContractDocuments');

interface ContractDocumentsProps {
  id: string;
}

/**
 * Documentos de un contrato. El archivo viaja en un FormData a la server action, que lo sube
 * al storage y registra los metadatos; el cliente nunca toca el bucket.
 */
export default function ContractDocuments({ id }: ContractDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<ContractDocument | null>(null);
  const [docType, setDocType] = useState('Contrato');
  const [docDescription, setDocDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<ContractDocument | null>(null);
  const queryClient = useQueryClient();
  const queryKey = ['contract-documents', id] as const;

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getContractDocuments(id),
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('contractId', id);
        formData.append('docType', docType);
        formData.append('docDescription', docDescription || docType);
        const result = await uploadContractDocument(formData);
        if (!result.ok) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      setSelectedFiles([]);
      setDocDescription('');
      setDocType('Contrato');
      queryClient.invalidateQueries({ queryKey });
      toast.success('¡Éxito!', { description: 'Los documentos se han subido correctamente.' });
    },
    onError: (error: Error) => {
      logger.error('Error al subir documentos', { data: { error } });
      queryClient.invalidateQueries({ queryKey });
      toast.error('Error', { description: error.message || 'Ocurrió un error al subir los documentos. Intenta de nuevo.', duration: Infinity });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: ContractDocument) => {
      const result = await deleteContractDocument(doc.id);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Documento eliminado', { description: 'El documento se ha eliminado correctamente.' });
    },
    onError: (error: Error) => {
      logger.error('Error al eliminar documento', { data: { error } });
      toast.error('Error', { description: error.message || 'No se pudo eliminar el documento. Intenta de nuevo.', duration: Infinity });
    },
    onSettled: () => setDocumentToDelete(null),
  });

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processFiles = (files: FileList) => {
    const newFiles = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast('Archivos seleccionados', { description: `Se han seleccionado ${newFiles.length} archivo(s). Presiona "Subir documento" para completar la carga.` });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
  };

  const openFileSelector = () => fileInputRef.current?.click();

  const uploadSelectedFiles = () => {
    if (selectedFiles.length === 0) {
      toast.warning('No hay archivos', { description: 'Selecciona al menos un archivo para subir.' });
      return;
    }
    uploadMutation.mutate(selectedFiles);
  };

  const handleDownload = async (doc: ContractDocument) => {
    const result = await getContractDocumentDownloadUrl(doc.id);
    if (!result.ok) {
      toast.error('Error', { description: result.error, duration: Infinity });
      return;
    }
    window.open(result.data.url, '_blank');
  };

  const isUploading = uploadMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const term = searchTerm.toLowerCase();
  const filteredDocuments = documents.filter(
    (doc) => doc.name.toLowerCase().includes(term) || doc.type.toLowerCase().includes(term)
  );

  return (
    <div className="max-w-full">
      <Card className="w-full">
        <CardContent className="w-full p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">Subir Documento</h3>
              <div className="space-y-4">
                <div
                  className={`border-2 ${isDragging ? 'border-green-500 bg-green-50' : 'border-dashed'} rounded-lg p-6 text-center cursor-pointer hover:bg-slate-50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={openFileSelector}
                >
                  {isUploading ? (
                    <Loader2 className="h-8 w-8 mx-auto mb-2 text-slate-400 animate-spin" />
                  ) : (
                    <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-green-500' : 'text-slate-400'}`} />
                  )}
                  <p className="text-sm text-slate-500">
                    {isUploading
                      ? 'Subiendo archivos...'
                      : isDragging
                        ? 'Suelta los archivos aquí'
                        : 'Arrastra y suelta archivos aquí o'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={isUploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      openFileSelector();
                    }}
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
                  />
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 border rounded p-3 bg-slate-50">
                    <h4 className="text-sm font-medium mb-2">Archivos seleccionados ({selectedFiles.length})</h4>
                    <div className="max-h-32 overflow-y-auto">
                      {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between text-sm py-1">
                          <div className="flex items-center">
                            {file.type.includes('pdf') && <FileText className="h-4 w-4 mr-2 text-red-500" />}
                            {file.type.includes('image') && <ImageIcon className="h-4 w-4 mr-2 text-blue-500" />}
                            {(file.type.includes('excel') ||
                              file.type.includes('spreadsheet') ||
                              file.name.endsWith('.xlsx') ||
                              file.name.endsWith('.xls')) && (
                              <FileSpreadsheet className="h-4 w-4 mr-2 text-green-500" />
                            )}
                            <span className="truncate max-w-[180px]">{file.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500"
                            onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="docType">Tipo de documento</Label>
                  <Input
                    id="docType"
                    type="text"
                    placeholder="Tipo de documento"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
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
                    onChange={(e) => setDocDescription(e.target.value)}
                    disabled={isUploading}
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={uploadSelectedFiles}
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

            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Documentos del Contrato</h3>
                <Input
                  placeholder="Buscar documentos..."
                  className="max-w-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div
                className={
                  !selectedFile
                    ? 'border rounded-lg overflow-x-auto overflow-y-hidden'
                    : 'border rounded-lg overflow-x-auto max-h-[250px] overflow-y-auto'
                }
              >
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <Loader2 className="h-8 w-8 text-slate-400 animate-spin mb-2" />
                    <p className="text-slate-500">Cargando documentos...</p>
                  </div>
                ) : filteredDocuments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tamaño</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center">
                              {doc.type === 'pdf' && <FileText className="h-4 w-4 mr-2 text-red-500" />}
                              {doc.type === 'image' && <ImageIcon className="h-4 w-4 mr-2 text-blue-500" />}
                              {doc.type === 'spreadsheet' && (
                                <FileSpreadsheet className="h-4 w-4 mr-2 text-green-500" />
                              )}
                              <span className="text-sm">{doc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{doc.type.toUpperCase()}</TableCell>
                          <TableCell>{doc.date ? moment(doc.date).format('DD/MM/YYYY') : '-'}</TableCell>
                          <TableCell>{doc.size}</TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedFile(doc)}
                                className="h-8 w-8 p-0"
                                title="Ver"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleDownload(doc)}
                                title="Descargar"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                onClick={() => setDocumentToDelete(doc)}
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <FileText className="h-12 w-12 text-slate-300 mb-2" />
                    {searchTerm ? (
                      <>
                        <p className="text-slate-500 mb-1">
                          No se encontraron documentos que coincidan con {searchTerm}
                        </p>
                        <p className="text-sm text-slate-400">Intenta con otro término de búsqueda</p>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-500 mb-1">No hay documentos para este contrato</p>
                        <p className="text-sm text-slate-400">
                          Sube documentos arrastrándolos o usando el botón de selección
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="mt-6 border rounded-lg p-4">
                  <h4 className="font-medium">Descripción: {selectedFile.description}</h4>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium">Vista previa: {selectedFile.name}</h4>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                      Cerrar
                    </Button>
                  </div>
                  <div className="bg-slate-100 rounded-lg h-[700px] flex items-center justify-center overflow-hidden">
                    {selectedFile.type === 'pdf' && selectedFile.url ? (
                      <embed src={selectedFile.url} type="application/pdf" width="100%" height="600px" />
                    ) : selectedFile.type === 'image' && selectedFile.url ? (
                      <img
                        src={selectedFile.url}
                        alt="Vista previa"
                        className="max-h-full max-w-full w-full object-contain mx-auto"
                      />
                    ) : (
                      <div className="text-center">
                        {selectedFile.type === 'spreadsheet' ? (
                          <FileSpreadsheet className="h-12 w-12 mx-auto text-green-500" />
                        ) : (
                          <FileText className="h-12 w-12 mx-auto text-slate-400" />
                        )}
                        <p className="mt-2">Vista previa no disponible</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => handleDownload(selectedFile)}
                        >
                          <Download className="h-3 w-3 mr-1" /> Descargar archivo
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!documentToDelete} onOpenChange={(open) => !open && !isDeleting && setDocumentToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el documento {documentToDelete?.name}? Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDocumentToDelete(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => documentToDelete && deleteMutation.mutate(documentToDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
