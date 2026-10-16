'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { getLoadEmployee, getMassiveLoadCatalogs } from './actions.server';

/** Los catálogos cambian poco: 5 minutos frescos alcanzan para una sesión de carga. */
const CATALOG_STALE_TIME = 5 * 60 * 1000;

/** Catálogos de la carga masiva (diagramas de trabajo y novedades) en una sola consulta. */
export function useMassiveLoadCatalogs() {
  return useQuery({
    queryKey: ['diagram-massive-catalogs'],
    queryFn: () => getMassiveLoadCatalogs(),
    staleTime: CATALOG_STALE_TIME,
  });
}

/** Empleado fijo del detalle: sólo consulta cuando hay un id. */
export function useLoadEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['diagram-load-employee', employeeId],
    queryFn: () => getLoadEmployee(employeeId as string),
    enabled: Boolean(employeeId),
    staleTime: CATALOG_STALE_TIME,
  });
}

/**
 * Refresca todo lo que muestra novedades cargadas: el calendario (`diagram-search`), los reportes y los
 * contadores de filtros, más las pantallas de servidor.
 */
export function useRefreshDiagramViews() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['diagram-search'] });
    void queryClient.invalidateQueries({ queryKey: ['diagram-reports-paginated'] });
    void queryClient.invalidateQueries({ queryKey: ['diagram-report-totals'] });
    void queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    router.refresh();
  }, [queryClient, router]);
}

/** Enlace al calendario de diagramas (`?subtab=old`) conservando el `tab` actual, como hace el navegador de vistas. */
export function useCalendarHref(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  const tab = searchParams.get('tab');
  if (tab) params.set('tab', tab);
  params.set('subtab', 'old');
  return `${pathname}?${params.toString()}`;
}
