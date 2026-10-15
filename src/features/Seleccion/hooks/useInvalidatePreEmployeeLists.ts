'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Invalida el cache de React Query de la lista de candidatos (datos paginados y opciones de filtro).
 * Con `includeEmployees` también la lista de empleados (al aprobar se crea un legajo).
 * Se usa junto a `router.refresh()`, que sólo refresca los Server Components (tarjetas y datos iniciales).
 */
export function useInvalidatePreEmployeeLists() {
  const queryClient = useQueryClient();

  return useCallback(
    (options?: { includeEmployees?: boolean }) => {
      void queryClient.invalidateQueries({ queryKey: ['pre-employees-paginated'] });
      void queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      if (options?.includeEmployees) {
        void queryClient.invalidateQueries({ queryKey: ['employees-paginated'] });
      }
    },
    [queryClient]
  );
}
