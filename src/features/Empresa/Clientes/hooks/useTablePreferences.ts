'use client';

import { getTablePreferences } from '@/shared/actions/table-preferences';
import { useQuery } from '@tanstack/react-query';

/**
 * Preferencias guardadas (columnas y filtros visibles) de una tabla que se monta en el cliente, como las de
 * la ficha del cliente: no hay Server Component que las lea. La tabla se renderiza recién cuando llegan,
 * porque `initialColumnVisibility` / `initialFilterVisibility` solo se leen al montar.
 */
export function useTablePreferences(tableId: string) {
  return useQuery({
    queryKey: ['table-preferences', tableId],
    queryFn: () => getTablePreferences(tableId),
    // Sin caché: la tabla guarda sus cambios por su cuenta y esta copia quedaría vieja al volver a la pestaña.
    staleTime: 0,
    gcTime: 0,
  });
}
