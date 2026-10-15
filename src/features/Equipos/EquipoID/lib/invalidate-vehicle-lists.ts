import type { QueryClient } from '@tanstack/react-query';

/**
 * Tras crear, editar o dar de baja/alta un vehículo: refresca los listados (activos y dados de baja) y los
 * conteos de sus filtros. Sin esto las tablas, que corren en client-side mode con `staleTime`, siguen
 * mostrando el estado anterior hasta que vence.
 */
export function invalidateVehicleLists(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['vehicles-list'] });
  queryClient.invalidateQueries({ queryKey: ['inactive-vehicles-list'] });
  queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
}
