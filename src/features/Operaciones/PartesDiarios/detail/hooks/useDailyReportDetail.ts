'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DETAIL_QUERY_PREFIX } from '../constants';

/**
 * Regla de invalidación del detalle: TODA query que dependa de las líneas del parte cuelga del
 * prefijo `[DETAIL_QUERY_PREFIX, dailyReportId, …]` (la tabla, el resumen por estado, los desvíos).
 * Con invalidar el prefijo alcanza para refrescarlas. Los facets de los filtros de la tabla viven
 * en otra familia (`['datatable-facet', <queryKey de la tabla>, …]`, donde el scope es
 * `[DETAIL_QUERY_PREFIX, id]`), así que se invalidan aparte, acotados a esta tabla.
 * Una query nueva del detalle debe usar `DETAIL_QUERY_PREFIX` como primer elemento de su key.
 */
export function useDailyReportDetailInvalidation() {
  const queryClient = useQueryClient();

  const invalidateDetail = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [DETAIL_QUERY_PREFIX] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet', [DETAIL_QUERY_PREFIX]] });
  }, [queryClient]);

  return { invalidateDetail };
}
