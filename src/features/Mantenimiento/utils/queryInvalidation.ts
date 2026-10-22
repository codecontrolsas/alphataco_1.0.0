import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalida todas las queries de mantenimiento de una vez.
 * Util para acciones que afectan multiples tabs (ej: generar OT, aprobar tareas).
 */
export function invalidateAllMaintenanceQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['maintenance'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance', 'order-management'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance', 'ordenes-mantenimiento'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance-orders'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance-operations'] });
  queryClient.invalidateQueries({ queryKey: ['equipments-with-deviations'] });
  queryClient.invalidateQueries({ queryKey: ['ordenes-trabajo'] });
  queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  queryClient.invalidateQueries({ queryKey: ['equipment'] });
  // Facetas de tablas (PendientesEjecutar, etc.)
  queryClient.invalidateQueries({ queryKey: ['pending-execution-facets'] });
  // Panel del operario
  queryClient.invalidateQueries({ queryKey: ['operator-work-orders'] });
  queryClient.invalidateQueries({ queryKey: ['operator-work-order'] });
  queryClient.invalidateQueries({ queryKey: ['operator-work-orders-completed'] });
  // DataTables en client-side mode: sus filas salen solo de React Query, así que
  // router.refresh() no las actualiza. Sus keys no comparten prefijo con las de arriba.
  queryClient.invalidateQueries({ queryKey: ['maintenance-requests-paginated'] });
  queryClient.invalidateQueries({ queryKey: ['maintenance-orders-paginated'] });
  queryClient.invalidateQueries({ queryKey: ['workshop-tracking-paginated'] });
  queryClient.invalidateQueries({ queryKey: ['equipments-with-deviations-list'] });
}
