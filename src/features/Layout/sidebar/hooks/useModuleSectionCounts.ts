'use client';

import { useQuery } from '@tanstack/react-query';
import { getModuleSectionCounts } from '../actions/section-counts';
import { SECTION_COUNTER_MODULES } from '../constants/navigation';

/**
 * Contadores de los sub-items de un módulo. Solo consulta si el módulo tiene contadores y está
 * desplegado; con `staleTime` corto y refetch al volver a la ventana alcanza sin tiempo real.
 */
export function useModuleSectionCounts(moduleSlug: string) {
  return useQuery({
    queryKey: ['sidebar-section-counts', moduleSlug],
    queryFn: () => getModuleSectionCounts(moduleSlug),
    enabled: SECTION_COUNTER_MODULES.has(moduleSlug),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
