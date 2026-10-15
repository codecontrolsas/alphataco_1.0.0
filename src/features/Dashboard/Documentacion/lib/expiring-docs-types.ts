import type { getEmployeeExpiringDocsPaginated } from '../Empleados/actions.server';
import type { getVehicleExpiringDocsPaginated } from '../Vehiculos/actions.server';

/** Fila de la tabla de documentos de empleados por vencer (inferida de la acción paginada). */
export type EmployeeExpiringDocListItem = Awaited<ReturnType<typeof getEmployeeExpiringDocsPaginated>>['data'][number];

/** Fila de la tabla de documentos de equipos por vencer (inferida de la acción paginada). */
export type VehicleExpiringDocListItem = Awaited<ReturnType<typeof getVehicleExpiringDocsPaginated>>['data'][number];
