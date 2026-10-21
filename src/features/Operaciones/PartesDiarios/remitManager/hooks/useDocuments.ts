'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteRemitDocument, getRemitDocumentDownloadUrl, getRemitDocumentUrl, uploadDocumentToRemito } from '../actions/remitos.server';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../types';
import { remitoQueryKeys } from './useRemitos';

export const documentQueryKeys = {
  all: ['documents'] as const,
  available: (rowId: string, remitId?: string) => ['documents', 'available', rowId, remitId] as const,
  url: (documentPath: string) => ['documents', 'url', documentPath] as const,
};

export function useDocumentUrl(documentPath: string) {
  return useQuery({
    queryKey: documentQueryKeys.url(documentPath),
    queryFn: () => getRemitDocumentUrl(documentPath),
    staleTime: 10 * 60 * 1000,
    enabled: !!documentPath,
  });
}

export function useUploadDocument(dailyReportRowId: string, customerName?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ remitId, file }: { remitId: string; file: File }) => {
      // El archivo viaja en un FormData: una Server Action no recibe `File` suelto.
      const formData = new FormData();
      formData.append('file', file);
      return uploadDocumentToRemito(remitId, formData, customerName);
    },
    onSuccess: (newDocument) => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.available(dailyReportRowId),
      });
      toast.success(`Documento ${newDocument.document_name} subido`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al subir el documento');
    },
  });
}

export function useDeleteDocument(dailyReportRowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => deleteRemitDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: remitoQueryKeys.byRowId(dailyReportRowId),
      });
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.available(dailyReportRowId),
      });
      toast.success('Documento eliminado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al eliminar el documento');
    },
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async ({ documentPath, documentName }: { documentPath: string; documentName: string }) => {
      // El servidor sólo firma la URL; la descarga la dispara el navegador.
      const url = await getRemitDocumentDownloadUrl(documentPath);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = documentName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return true;
    },
    onSuccess: () => {
      toast.success('Documento descargado');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al descargar el documento');
    },
  });
}

export function useFileValidation() {
  const validateFile = (file: File) => {
    const errors: string[] = [];

    if (file.size > MAX_FILE_SIZE) {
      errors.push('El archivo no puede ser mayor a 10MB');
    }

    if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) {
      errors.push('Solo se permiten archivos PDF, JPG, PNG o WebP');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  return { validateFile };
}
