/**
 * Maquina de estados de los pedidos de materiales (spec etapa 3 §3.1). Pura: la usan las
 * actions (validar una accion antes de escribir) y la pantalla (que botones mostrar).
 */

export const MATERIAL_REQUEST_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'REJECTED',
  'CLOSED',
  'CANCELLED',
] as const;
export type MaterialRequestStatus = (typeof MATERIAL_REQUEST_STATUSES)[number];

export type RequestAction = 'approve' | 'reject' | 'cancel' | 'deliver' | 'close';

const ALLOWED_FROM: Record<RequestAction, readonly MaterialRequestStatus[]> = {
  approve: ['PENDING_APPROVAL'],
  reject: ['PENDING_APPROVAL'],
  cancel: ['PENDING_APPROVAL'],
  deliver: ['APPROVED', 'PARTIALLY_DELIVERED'],
  close: ['APPROVED', 'PARTIALLY_DELIVERED'],
};

export function canApplyRequestAction(status: MaterialRequestStatus, action: RequestAction): boolean {
  return ALLOWED_FROM[action].includes(status);
}

/** Estados cuyo valor sale de lo entregado (los demas no se recalculan). */
const DELIVERY_DRIVEN: readonly MaterialRequestStatus[] = ['APPROVED', 'PARTIALLY_DELIVERED', 'DELIVERED'];

/**
 * Estado despues de una entrega o de anular una entrega. Un pedido cerrado, rechazado o
 * cancelado no cambia: cerrarlo fue una decision explicita.
 */
export function statusAfterDeliveries(
  current: MaterialRequestStatus,
  lines: readonly { requested: number; delivered: number }[]
): MaterialRequestStatus {
  if (!DELIVERY_DRIVEN.includes(current)) return current;
  const anyDelivered = lines.some((l) => l.delivered > 0);
  const allDelivered = lines.length > 0 && lines.every((l) => l.delivered >= l.requested);
  if (allDelivered) return 'DELIVERED';
  return anyDelivered ? 'PARTIALLY_DELIVERED' : 'APPROVED';
}
