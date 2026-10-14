'use client';

import SimpleDocument from '@/features/Documentacion/shared/components/SimpleDocument';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { invalidateDocumentLists } from '../lib/document-query-keys';

interface RequirementUploadProps {
  /** Empleado o equipo al que se le exige el documento. */
  kind: 'employee' | 'vehicle';
  resourceId: string;
  documentTypeId: string;
  /** Período `YYYY-MM` de una fila faltante mensual. */
  period?: string | null;
  close: () => void;
}

/**
 * Formulario de subida de una fila FALTANTE de las listas de documentos: recurso y tipo vienen fijos
 * (la fila no tiene un documento que actualizar). Tras subir, `SimpleDocument` invalida React Query
 * (la tabla) y acá se refresca la ruta para que las tarjetas por estado, que son SSR, también cambien.
 */
export function RequirementUpload({ kind, resourceId, documentTypeId, period, close }: RequirementUploadProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <SimpleDocument
      resource={kind === 'vehicle' ? 'equipo' : 'empleado'}
      handleOpen={close}
      requirement={{ kind, resourceId, documentTypeId, ...(period ? { period } : {}) }}
      onUploaded={() => {
        void invalidateDocumentLists(queryClient);
        router.refresh();
      }}
    />
  );
}
