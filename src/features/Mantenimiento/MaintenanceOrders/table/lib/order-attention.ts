import { argentinaDate } from '@/shared/lib/argentina-time';
import { ATTENTION_THRESHOLDS, daysAgo, type AttentionKey } from '../../../lib/attention-thresholds';

/**
 * Filtro virtual `attention` del paso "En Taller".
 *
 * No es una columna: cada valor es una condición sobre `maintenance_orders`. La define UN solo helper, que
 * usan el listado (`buildOrdersWhere`) y las métricas (`getInWorkshopMetrics`), así el número de la tarjeta
 * y el total de la tabla al filtrarla son siempre el mismo.
 *
 * Módulo puro (sin directiva ni Prisma): lo importan el servidor y las tarjetas del cliente.
 */
export const IN_WORKSHOP_ATTENTION_KEYS = [
  'no_work_orders',
  'stuck',
  'overdue',
] as const satisfies readonly AttentionKey[];

export type InWorkshopAttentionKey = (typeof IN_WORKSHOP_ATTENTION_KEYS)[number];

export function isInWorkshopAttentionKey(value: string | null | undefined): value is InWorkshopAttentionKey {
  return IN_WORKSHOP_ATTENTION_KEYS.some((key) => key === value);
}

/** Estados de tarea que dejan a la orden trabada: esperan autorización o fueron devueltas a reasignar. */
const STUCK_REPAIR_STATUSES = ['pending_approval', 'reassignment_requested'];

/**
 * Inicio (hora argentina) del día que cae `days` días antes de hoy. Se corta por día calendario para
 * coincidir con "N días en taller" de la columna, que cuenta días argentinos y no bloques de 24 h.
 */
function argentinaDayStart(days: number, now: Date): Date {
  return new Date(`${argentinaDate(daysAgo(days, now))}T00:00:00-03:00`);
}

/** Condición Prisma de cada valor del filtro `attention`. Va dentro de un `AND`, nunca suelta. */
export function buildInWorkshopAttentionCondition(
  key: InWorkshopAttentionKey,
  now: Date = new Date()
): Record<string, unknown> {
  switch (key) {
    // Ingresó al taller y ningún ítem tiene todavía una OT asignada
    case 'no_work_orders':
      return { status: 'in_workshop', maintenance_order_items: { none: { work_order_id: { not: null } } } };
    // Alguna tarea espera autorización o volvió para reasignar
    case 'stuck':
      return {
        maintenance_order_items: {
          some: {
            work_order_items: {
              some: { work_order_item_repairs: { some: { status: { in: STUCK_REPAIR_STATUSES } } } },
            },
          },
        },
      };
    // Lleva más de N días en el taller (la fecha de ingreso es anterior al corte)
    case 'overdue':
      return { workshop_entry_date: { lt: argentinaDayStart(ATTENTION_THRESHOLDS.inWorkshopDays, now) } };
  }
}
