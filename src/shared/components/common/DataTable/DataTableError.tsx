'use client';

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface DataTableErrorProps {
  /** Reintenta la consulta fallida (`refetch` de React Query). */
  onRetry: () => void;
  /** true mientras se reintenta: deshabilita el botón y muestra el indicador de carga. */
  isRetrying: boolean;
  /** true si hay datos previos en pantalla que quedaron desactualizados. */
  hasStaleData: boolean;
}

/**
 * Aviso de error de carga del DataTable (client-side mode). `role="alert"` (lo trae el Alert)
 * hace que los lectores de pantalla lo anuncien al aparecer.
 */
export function DataTableError({ onRetry, isRetrying, hasStaleData }: DataTableErrorProps) {
  return (
    <Alert variant="destructive" data-testid="data-table-error">
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      <AlertTitle>No se pudieron cargar los datos</AlertTitle>
      <AlertDescription>
        {hasStaleData
          ? 'Los datos que ves pueden estar desactualizados. Reintentá para actualizarlos.'
          : 'Ocurrió un problema al consultar la información. Reintentá o cambiá los filtros.'}
      </AlertDescription>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying} className="col-start-2 mt-2 w-fit">
        {isRetrying ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {isRetrying ? 'Reintentando...' : 'Reintentar'}
      </Button>
    </Alert>
  );
}
