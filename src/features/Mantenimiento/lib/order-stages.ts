import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';

/**
 * Etapas del recorrido de una orden de mantenimiento (barra de etapas del detalle).
 * Todo sale de timestamps que `getMaintenanceOrderDetail` ya trae: no hace falta tocar el select.
 */

export type OrderStageState = 'done' | 'current' | 'pending' | 'rejected';

export interface OrderStage {
  key: 'request' | 'approved' | 'scheduled' | 'entry' | 'workshop' | 'validation';
  label: string;
  meta?: string;
  state: OrderStageState;
}

type DateLike = Date | string | null | undefined;

/** Orden reducida a lo que usa la barra; compatible con el detalle de la orden. */
export interface OrderStagesInput {
  status: string;
  created_at?: DateLike;
  scheduled_at?: DateLike;
  workshop_entry_date?: DateLike;
  workshop_validated_at?: DateLike;
  rejected_at?: DateLike;
  maintenance_requests?: { created_at?: DateLike } | null;
}

const REJECTED_STATUSES = ['rejected', 'workshop_rejected'];
/** Estados en los que la orden ya pasó por el ingreso al taller. */
const POST_ENTRY = [
  'in_workshop',
  'pending_workshop_validation',
  'pending_operations_validation',
  'operations_rejected',
  'workshop_rejected',
  'completed',
];
const POST_WORKSHOP = [
  'pending_workshop_validation',
  'pending_operations_validation',
  'operations_rejected',
  'completed',
];

function dayOf(value: DateLike): string | null {
  return value ? formatArgentinaDay(value) : null;
}

/** Días completos entre dos instantes, contando por día argentino. */
function daysBetween(from: Date | string, to: Date | string): number {
  const start = Date.parse(`${argentinaDate(new Date(from))}T00:00:00Z`);
  const end = Date.parse(`${argentinaDate(new Date(to))}T00:00:00Z`);
  return Math.max(Math.round((end - start) / 86_400_000), 0);
}

export function buildOrderStages(order: OrderStagesInput): OrderStage[] {
  const { status } = order;
  const requestAt = order.maintenance_requests?.created_at ?? null;

  const workshopDays = order.workshop_entry_date
    ? daysBetween(order.workshop_entry_date, order.workshop_validated_at ?? new Date())
    : null;

  const base: Omit<OrderStage, 'state'>[] = [
    { key: 'request', label: 'Solicitud', meta: dayOf(requestAt) ?? undefined },
    { key: 'approved', label: 'Aprobada', meta: dayOf(order.created_at) ?? undefined },
    { key: 'scheduled', label: 'Programada', meta: dayOf(order.scheduled_at) ?? undefined },
    { key: 'entry', label: 'Ingreso', meta: dayOf(order.workshop_entry_date) ?? undefined },
    {
      key: 'workshop',
      label: 'En taller',
      meta: workshopDays == null ? undefined : `${workshopDays} ${workshopDays === 1 ? 'día' : 'días'}`,
    },
    { key: 'validation', label: 'Validación', meta: dayOf(order.workshop_validated_at) ?? undefined },
  ];

  const done: boolean[] = [
    // Un pedido manual no nace de una solicitud: la etapa queda sin fecha y no cuenta como pendiente.
    requestAt != null,
    true,
    order.scheduled_at != null || POST_ENTRY.includes(status),
    order.workshop_entry_date != null || POST_ENTRY.includes(status),
    POST_WORKSHOP.includes(status),
    status === 'completed',
  ];

  // La etapa actual es la primera que falta (sin contar la solicitud, que puede no existir).
  const currentIndex = done.findIndex((isDone, index) => index > 0 && !isDone);
  const isRejected = REJECTED_STATUSES.includes(status);

  return base.map((stage, index) => {
    if (done[index]) return { ...stage, state: 'done' };
    if (index === currentIndex) {
      // El rechazo se fecha en la etapa donde se frenó el circuito.
      const meta = isRejected ? (dayOf(order.rejected_at) ?? stage.meta) : stage.meta;
      return { ...stage, meta, state: isRejected ? 'rejected' : 'current' };
    }
    return { ...stage, state: 'pending' };
  });
}
