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
import { useToast } from '@/components/ui/use-toast';
import { usePermissions } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  deleteContractDocument,
  getContractDocumentDownloadUrl,
  getContractDocuments,
  uploadContractDocument,
  type ContractDocument,
} from '../../actions/services.server';
import { ContractDocumentPreviewDialog } from './ContractDocumentPreviewDialog';
import { ContractDocumentUploadForm } from './ContractDocumentUploadForm';
import { ContractDocumentsList } from './ContractDocumentsList';

const logger = new Logger('features/Empresa/Clientes/ContractDocuments');

const DEFAULT_DOC_TYPE = 'Contrato';

interface ContractDocumentsProps {
  id: string;
}

/**
 * Documentos de un contrato. El archivo viaja en un FormData a la server action, que lo sube
 * al storage y registra los metadatos; el cliente nunca toca el bucket.
 *
 * Este componente es el contenedor (consultas, mutaciones y confirmación de borrado); la lista, el formulario
 * de subida y la vista previa viven en sus propios archivos.
 */
export default function ContractDocuments({ id }: ContractDocumentsProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ContractDocument | null>(null);
  const [docType, setDocType] = useState(DEFAULT_DOC_TYPE);
  const [docDescription, setDocDescription] = useState('');
  const [documentToDelete, setDocumentToDelete] = useState<ContractDocument | null>(null);
  const { toast } = useToast();
  // Subir y eliminar tienen su propia acción en `documentos-contrato` (el servidor lo vuelve a verificar).
  const { hasPermission } = usePermissions();
  const canUpload = hasPermission('comercial', 'documentos-contrato', 'create');
  const canDelete = hasPermission('comercial', 'documentos-contrato', 'delete');
  const queryClient = useQueryClient();
  const queryKey = ['contract-documents', id] as const;

  const documentsQuery = useQuery({
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
      setDocType(DEFAULT_DOC_TYPE);
      queryClient.invalidateQueries({ queryKey });
      toast({ title: '¡Éxito!', description: 'Los documentos se han subido correctamente.' });
    },
    onError: (error: Error) => {
      logger.error('Error al subir documentos', { data: { error } });
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Error',
        description: error.message || 'Ocurrió un error al subir los documentos. Intentá de nuevo.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: ContractDocument) => {
      const result = await deleteContractDocument(doc.id);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Documento eliminado', description: 'El documento se ha eliminado correctamente.' });
    },
    onError: (error: Error) => {
      logger.error('Error al eliminar documento', { data: { error } });
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar el documento. Intentá de nuevo.',
        variant: 'destructive',
      });
    },
    onSettled: () => setDocumentToDelete(null),
  });

  const handleFilesAdded = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
    toast({
      title: 'Archivos seleccionados',
      description: `Se han seleccionado ${files.length} archivo(s). Presioná "Subir documento" para completar la carga.`,
    });
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast({ title: 'No hay archivos', description: 'Seleccioná al menos un archivo para subir.' });
      return;
    }
    uploadMutation.mutate(selectedFiles);
  };

  const handleDownload = async (doc: ContractDocument) => {
    try {
      const result = await getContractDocumentDownloadUrl(doc.id);
      if (!result.ok) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
        return;
      }
      window.open(result.data.url, '_blank');
    } catch (error) {
      logger.error('Error al descargar el documento', { data: { error, documentId: doc.id } });
      toast({ title: 'Error', description: 'No se pudo descargar el documento.', variant: 'destructive' });
    }
  };

  const isDeleting = deleteMutation.isPending;

  return (
    <div className="max-w-full">
      <Card className="w-full">
        <CardContent className="w-full p-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {canUpload && (
              <div className="md:col-span-1">
                <ContractDocumentUploadForm
                  selectedFiles={selectedFiles}
                  onFilesAdded={handleFilesAdded}
                  onFileRemoved={(index) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
                  docType={docType}
                  onDocTypeChange={setDocType}
                  docDescription={docDescription}
                  onDocDescriptionChange={setDocDescription}
                  isUploading={uploadMutation.isPending}
                  onUpload={handleUpload}
                />
              </div>
            )}

            <div className={canUpload ? 'min-w-0 md:col-span-2' : 'min-w-0 md:col-span-3'}>
              <ContractDocumentsList
                documents={documentsQuery.data ?? []}
                isLoading={documentsQuery.isPending}
                isError={documentsQuery.isError}
                isRetrying={documentsQuery.isFetching}
                onRetry={() => documentsQuery.refetch()}
                canUpload={canUpload}
                canDelete={canDelete}
                onPreview={setPreviewDoc}
                onDownload={handleDownload}
                onDelete={setDocumentToDelete}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <ContractDocumentPreviewDialog
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDownload={handleDownload}
      />

      <Dialog open={!!documentToDelete} onOpenChange={(open) => !open && !isDeleting && setDocumentToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar el documento {documentToDelete?.name}? Esta acción no se puede
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
