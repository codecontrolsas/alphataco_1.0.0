import { ACTIVITY_LOG } from './action-types';

/**
 * Etapas en las que se divide el historial de una OM (ticket 649).
 *
 * El cliente las definió por hito del circuito, no por tabla de origen:
 *
 *  - **Pedido**: todo lo que pasa hasta que el equipo entra al taller.
 *  - **Coordinación de Mantenimiento**: desde la fecha de ingreso a taller
 *    hasta la generación de la OT, y al final la fecha de la aprobación.
 *  - **Taller**: el resto (la ejecución).
 */
export type ActivityStage = 'request' | 'coordination' | 'workshop';

export const ACTIVITY_STAGE_ORDER: ActivityStage[] = ['request', 'coordination', 'workshop'];

export const ACTIVITY_STAGE_LABELS: Record<ActivityStage, string> = {
  request: 'Pedido',
  coordination: 'Coordinación de Mantenimiento',
  workshop: 'Taller',
};

export const ACTIVITY_STAGE_DESCRIPTIONS: Record<ActivityStage, string> = {
  request: 'Desde la carga del pedido hasta el ingreso a taller',
  coordination: 'Del ingreso a taller a la generación de las órdenes de trabajo',
  workshop: 'Ejecución de las reparaciones',
};

/**
 * Etapa de cada `action_type`.
 *
 * `workshop_entry` es la bisagra: es el hito "fecha de ingreso a taller", que el
 * cliente puso como PRIMER evento de Coordinación, no como último del Pedido.
 */
const STAGE_BY_ACTION: Record<string, ActivityStage> = {
  // ── Pedido: hasta que entra al taller ──────────────────────────────
  [ACTIVITY_LOG.CREATED]: 'request',
  [ACTIVITY_LOG.REQUEST_APPROVED]: 'request',
  [ACTIVITY_LOG.REJECTED]: 'request',
  [ACTIVITY_LOG.SCHEDULED]: 'request',
  [ACTIVITY_LOG.DATE_CONFIRMED]: 'request',
  [ACTIVITY_LOG.DATE_REJECTED]: 'request',

  // ── Coordinación: del ingreso a taller a la generación de la OT ────
  [ACTIVITY_LOG.WORKSHOP_ENTRY]: 'coordination',
  [ACTIVITY_LOG.ORDER_NUMBER_GENERATED]: 'coordination',
  [ACTIVITY_LOG.ORDER_ITEMS_UPDATED]: 'coordination',
  [ACTIVITY_LOG.ORDER_ITEMS_ASSIGNED]: 'coordination',
  [ACTIVITY_LOG.ORDER_ITEM_ADDED]: 'coordination',
  [ACTIVITY_LOG.ORDER_ITEM_REMOVED]: 'coordination',
  [ACTIVITY_LOG.ORDER_ITEM_REPAIR_TYPES_UPDATED]: 'coordination',
  [ACTIVITY_LOG.SECTOR_EXECUTION_ORDER_UPDATED]: 'coordination',
  [ACTIVITY_LOG.WORK_ORDER_CREATED]: 'coordination',
  [ACTIVITY_LOG.WORK_ORDERS_GENERATED]: 'coordination',
  // "Por último, va la fecha de la aprobación": la aprobación del jefe de taller
  // sobre la orden ya armada cierra la etapa de coordinación.
  [ACTIVITY_LOG.WORKSHOP_APPROVED]: 'coordination',
  [ACTIVITY_LOG.OPERATIONS_APPROVED]: 'coordination',

  // ── Taller: la ejecución ───────────────────────────────────────────
  [ACTIVITY_LOG.WORKSHOP_ITEM_REJECTED]: 'workshop',
  [ACTIVITY_LOG.OPERATIONS_ITEM_REJECTED]: 'workshop',
  [ACTIVITY_LOG.WORKSHOP_AGREED_OPS_REJECTION]: 'workshop',
  [ACTIVITY_LOG.WORKSHOP_DISAGREED_OPS_REJECTION]: 'workshop',
  [ACTIVITY_LOG.WORKSHOP_REJECTED_ALL_ITEMS]: 'workshop',
  [ACTIVITY_LOG.WORKSHOP_RESTORED_FROM_REJECTED]: 'workshop',
  [ACTIVITY_LOG.WORKSHOP_RETURNED_ORDER]: 'workshop',
  [ACTIVITY_LOG.WORK_ORDER_COMPLETED]: 'workshop',
  [ACTIVITY_LOG.EXTERNAL_WO_COMPLETED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_TASK_APPROVED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_TASK_REJECTED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_TASK_REASSIGNED]: 'workshop',
  [ACTIVITY_LOG.WO_STARTED]: 'workshop',
  [ACTIVITY_LOG.WO_PAUSED]: 'workshop',
  [ACTIVITY_LOG.WO_RESUMED]: 'workshop',
  [ACTIVITY_LOG.WO_CLOSED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_COMPLETED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_UNCOMPLETED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_TECHNICIAN_NOTES_UPDATED]: 'workshop',
  [ACTIVITY_LOG.REPAIR_RETURNED_TO_CHIEF]: 'workshop',
  [ACTIVITY_LOG.TASK_ADDED_BY_OPERATOR]: 'workshop',
  [ACTIVITY_LOG.TASK_REQUESTED_FOR_OTHER_SECTOR]: 'workshop',
  [ACTIVITY_LOG.MATERIAL_REQUEST_CREATED]: 'workshop',
};

/**
 * Etapa de un evento del historial.
 *
 * `action_type` es una columna de texto libre (no un enum de Postgres) y el
 * trigger SQL puede escribir `status_changed` o `completed` como fallback: lo
 * desconocido se ubica por la FK que traiga, que es la única otra señal de en
 * qué parte del circuito ocurrió. Sin ninguna señal cae en Taller, que es donde
 * termina el flujo.
 */
export function getActivityStage(entry: {
  action_type: string;
  work_order_id?: string | null;
  maintenance_order_id?: string | null;
}): ActivityStage {
  const known = STAGE_BY_ACTION[entry.action_type];
  if (known) return known;
  if (entry.work_order_id) return 'workshop';
  if (entry.maintenance_order_id) return 'coordination';
  return 'request';
}
