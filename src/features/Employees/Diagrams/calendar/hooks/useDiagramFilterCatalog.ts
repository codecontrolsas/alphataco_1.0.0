'use client';

import { useQuery } from '@tanstack/react-query';
import { getDiagramFilterCatalog } from '../../actions/diagram-search-actions';

/**
 * Catálogos de los 8 filtros (y tipos de novedad con color) en un solo viaje. Se pide solo cuando hace falta:
 * al abrir el panel de filtros, al editar una casilla o cuando la URL ya trae filtros (para rotular los chips).
 */
export function useDiagramFilterCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ['diagram-filter-catalog'],
    queryFn: () => getDiagramFilterCatalog(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}
