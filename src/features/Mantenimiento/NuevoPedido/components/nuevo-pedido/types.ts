import type { fetchSupervisorsForResource } from '@/features/Checklists/actions/actionsServer';
import type { CreateDeviationFromNuevoPedido } from '../../actions/orders.server';

export type SelectedDeviation = CreateDeviationFromNuevoPedido;

/**
 * Caminos para crear el pedido:
 * - checklist:  desde los desvíos de una inspección (el original)
 * - preventive: programa planificado de mantenimiento
 * - manual:     carga directa de reparaciones, sin pasar por un checklist (ticket 592)
 */
export type RequestType = 'checklist' | 'preventive' | 'manual';

/** Orden visual de las tarjetas — lo usa la navegación por flechas del radiogroup */
export const REQUEST_TYPE_ORDER: RequestType[] = ['checklist', 'preventive', 'manual'];

/**
 * Recurso normalizado del selector: vehículos y equipamientos se identifican y se miden
 * distinto, así que el paso "Equipo" trabaja siempre con esta forma común.
 */
export interface ResourceOption {
  id: string;
  label: string;
  internNumber: string | null;
  typeName: string | null;
  subTypeName: string | null;
  unitTypeName: string | null;
  condition: string | null;
  kilometer: string | null;
  engineHours: string | null;
}

/** Supervisor de turno, como lo devuelve el listado de checklists. */
export type SupervisorOption = Awaited<ReturnType<typeof fetchSupervisorsForResource>>[number];
