/**
 * Estados y transiciones del circuito de taller: `maintenance_orders` y `work_orders`.
 *
 * Módulo puro (sin acceso a datos) para que las reglas del circuito vivan en un solo
 * lugar y puedan testearse: las actions leen el estado actual, consultan acá y escriben.
 */

/** Estados de `maintenance_orders` (columna `status`, texto libre en la BD). */
export const MAINTENANCE_ORDER_STATUSES = [
  'pending_scheduling',
  'date_confirmed',
  'scheduled',
  'in_workshop',
  'pending_workshop_validation',
  /** Fuera del circuito desde la reunión 31/08/2026; se conserva por los registros históricos. */
  'pending_operations_validation',
  'operations_rejected',
  'workshop_rejected',
  /** El taller rechaza el pedido antes de programarlo (`rejectPendingOrder`). */
  'rejected',
  'completed',
] as const;
export type MaintenanceOrderStatus = (typeof MAINTENANCE_ORDER_STATUSES)[number];

/**
 * Estados terminales de `maintenance_orders` (sin transiciones de salida). Todo lo demás es un
 * pedido abierto: lo usan la ficha del equipo y el Dashboard, así cuentan lo mismo.
 */
export const MAINTENANCE_ORDER_TERMINAL_STATUSES = [
  'completed',
  'rejected',
] as const satisfies readonly MaintenanceOrderStatus[];

const MAINTENANCE_ORDER_TRANSITIONS: Record<MaintenanceOrderStatus, readonly MaintenanceOrderStatus[]> = {
  // El taller programa la fecha (`date_confirmed`) o rechaza el pedido sin programarlo.
  pending_scheduling: ['date_confirmed', 'scheduled', 'rejected'],
  // Confirmada la fecha, el equipo entra al taller; un rechazo la devuelve a pendiente.
  date_confirmed: ['scheduled', 'in_workshop', 'pending_scheduling'],
  scheduled: ['in_workshop', 'pending_scheduling'],
  // En taller: se cierra para validar, o el taller rechaza todos los ítems.
  in_workshop: ['pending_workshop_validation', 'workshop_rejected'],
  // El jefe de taller cierra (circuito vigente), devuelve al taller, o deriva a Operaciones.
  pending_workshop_validation: ['completed', 'in_workshop', 'pending_operations_validation'],
  pending_operations_validation: ['completed', 'pending_workshop_validation', 'operations_rejected'],
  // El taller acepta el rechazo (vuelve al taller) o lo discute (vuelve a Operaciones).
  operations_rejected: ['in_workshop', 'pending_operations_validation'],
  workshop_rejected: ['in_workshop'],
  rejected: [],
  completed: [],
};

export function isMaintenanceOrderStatus(value: string): value is MaintenanceOrderStatus {
  return (MAINTENANCE_ORDER_STATUSES as readonly string[]).includes(value);
}

/** Estados a los que puede pasar una orden; `[]` si el estado es terminal o desconocido. */
export function nextMaintenanceOrderStatuses(from: string): MaintenanceOrderStatus[] {
  if (!isMaintenanceOrderStatus(from)) return [];
  return [...MAINTENANCE_ORDER_TRANSITIONS[from]];
}

export function isValidMaintenanceOrderTransition(from: string, to: string): boolean {
  if (!isMaintenanceOrderStatus(from) || !isMaintenanceOrderStatus(to)) return false;
  return MAINTENANCE_ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Cierres válidos de una OT: una OT cancelada no cuenta como cerrada para la orden.
 *
 * Acá NO vive la máquina de estados de `work_orders`: los cambios de estado de una OT los
 * hace el panel del operario (`OperatorPanel`, fuera de esta carpeta) y dentro de
 * Mantenimiento la única escritura es la reapertura masiva, que ya se acota con un
 * `where: { status: { in: [...] } }`. Una máquina sin quien la consulte es código muerto.
 */
export const WORK_ORDER_CLOSED_STATUSES = ['completed', 'completed_partial'] as const;

export function isWorkOrderClosed(status: string): boolean {
  return (WORK_ORDER_CLOSED_STATUSES as readonly string[]).includes(status);
}

/**
 * La orden pasa a validación del taller cuando TODAS sus OTs están cerradas.
 * Sin OTs no hay nada que cerrar: devuelve `false`.
 */
export function areAllWorkOrdersClosed(statuses: readonly string[]): boolean {
  return statuses.length > 0 && statuses.every(isWorkOrderClosed);
}

/** Ítem de la orden reducido a lo que decide el rechazo total. */
export interface OrderItemRejectionState {
  is_rejected: boolean;
  is_diagnostico: boolean;
}

/**
 * Estado al que hay que mover la orden tras rechazar/restaurar/agregar ítems,
 * o `null` si no hay que tocarla. Los ítems de diagnóstico no cuentan.
 */
export function resolveWorkshopRejectionStatus(
  currentStatus: string,
  items: readonly OrderItemRejectionState[]
): 'workshop_rejected' | 'in_workshop' | null {
  const regularItems = items.filter((item) => !item.is_diagnostico);
  if (regularItems.length === 0) return null;

  const allRejected = regularItems.every((item) => item.is_rejected);
  if (allRejected) return currentStatus === 'workshop_rejected' ? null : 'workshop_rejected';

  const hasNonRejected = regularItems.some((item) => !item.is_rejected);
  if (hasNonRejected && currentStatus === 'workshop_rejected') return 'in_workshop';

  return null;
}

/**
 * Condición del recurso al cerrar una orden: vuelve a operativo sólo si no le
 * quedan OTRAS órdenes dentro del taller.
 */
export function resolveResourceConditionAfterClose(remainingOrdersInWorkshop: number): 'operativo' | 'no_operativo' {
  return remainingOrdersInWorkshop > 0 ? 'no_operativo' : 'operativo';
}
