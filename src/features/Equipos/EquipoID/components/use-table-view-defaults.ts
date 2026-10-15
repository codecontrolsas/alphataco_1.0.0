'use client';

import { getTablePreferences } from '@/shared/actions/table-preferences';
import { useQuery } from '@tanstack/react-query';

/**
 * Visibilidad inicial de columnas y filtros de las tablas de la ficha del equipo.
 *
 * Estas tablas se montan en el cliente (no hay Server Component que lea las preferencias del usuario), así
 * que se piden acá. La tabla recién se dibuja cuando están listas: el DataTable toma la visibilidad inicial
 * una sola vez al montar. Si el usuario no guardó nada, rigen los valores por defecto (solo 3 filtros visibles
 * y las columnas secundarias ocultas). Un error al leer las preferencias no bloquea la tabla.
 */
export function useTableViewDefaults(
  tableId: string,
  options: { hiddenColumns: readonly string[]; visibleFilters: readonly string[]; filterIds: readonly string[] }
) {
  const { data, isSuccess, isError } = useQuery({
    queryKey: ['table-preferences', tableId],
    queryFn: () => getTablePreferences(tableId),
    // Sin caché: el DataTable guarda los cambios del usuario en la base y al volver a montar debe leerlos de nuevo.
    staleTime: 0,
    gcTime: 0,
  });

  const saved = data ?? {};
  const savedColumns =
    saved.columnVisibility && Object.keys(saved.columnVisibility).length > 0 ? saved.columnVisibility : null;
  const savedFilters =
    saved.filterVisibility && Object.keys(saved.filterVisibility).length > 0 ? saved.filterVisibility : null;

  return {
    ready: isSuccess || isError,
    initialColumnVisibility:
      savedColumns ?? Object.fromEntries(options.hiddenColumns.map((columnId) => [columnId, false])),
    initialFilterVisibility:
      savedFilters ??
      Object.fromEntries(options.filterIds.map((filterId) => [filterId, options.visibleFilters.includes(filterId)])),
  };
}
