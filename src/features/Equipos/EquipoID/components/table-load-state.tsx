'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';

/**
 * Estado de carga de las tablas paginadas de la ficha del equipo.
 *
 * Cuando la consulta falla, el DataTable cae a sus datos vacíos y muestra su `emptyMessage` ("no hay
 * órdenes…"), que sería una afirmación falsa: no hubo ninguna orden que mostrar porque no se pudo consultar.
 * Este hook marca la falla para mostrar un aviso con reintento, y avisa cuándo respondió la primera
 * consulta para no mostrar "no hay registros" mientras todavía se está cargando.
 */
export function useTrackedTableQuery<TData>(
  fetcher: (params: DataTableSearchParams) => Promise<{ data: TData[]; total: number }>
) {
  const [loadFailed, setLoadFailed] = useState(false);
  // `false` hasta que la primera consulta responde (bien o mal): mientras tanto la tabla no debe afirmar "no hay registros".
  const [settled, setSettled] = useState(false);

  const tableQueryFn = useCallback(
    async (params: DataTableSearchParams) => {
      try {
        const result = await fetcher(params);
        setLoadFailed(false);
        return result;
      } catch (error) {
        setLoadFailed(true);
        throw error;
      } finally {
        setSettled(true);
      }
    },
    [fetcher]
  );

  return { tableQueryFn, loadFailed, settled };
}

interface TableLoadErrorProps {
  /** Prefijo de la `queryKey` de la tabla: el reintento invalida todas sus páginas. */
  queryKey: readonly unknown[];
  label: string;
}

export function TableLoadError({ queryKey, label }: TableLoadErrorProps) {
  const queryClient = useQueryClient();

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle />
      <AlertTitle>No se pudo cargar {label}</AlertTitle>
      <AlertDescription>
        <p>Lo que ves abajo puede estar incompleto. Reintentá en unos segundos.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 gap-2"
          onClick={() => queryClient.invalidateQueries({ queryKey })}
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  );
}
