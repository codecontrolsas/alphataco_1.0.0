import { argentinaDate } from '@/shared/lib/argentina-time';

/**
 * Umbrales de "Atención" del módulo Mantenimiento: cuándo un pedido, una orden o un equipo pasa a pedir acción.
 *
 * Módulo puro (sin directiva): lo usan las queries de conteo del servidor y las columnas del cliente, y
 * ambos tienen que contar con el MISMO número o la métrica deja de coincidir con la lista que filtra.
 */
export const ATTENTION_THRESHOLDS = {
  /** Solicitudes sin validar. */
  requestPendingHours: 48,
  /** Pedidos por programar, desde `created_at` ("Fecha Aprobación"). */
  schedulingPendingDays: 7,
  /** Órdenes en taller, desde `workshop_entry_date`. */
  inWorkshopDays: 14,
  /** Desvío pendiente más viejo de un equipo sin solicitud. */
  deviationsWithoutRequestDays: 30,
  /** Pedidos rechazados por el taller que todavía se avisan en Seguimiento (D-5, a confirmar). */
  recentRejectionDays: 7,
} as const;

/** Instante de hace `h` horas. `now` se inyecta para poder fijarlo. */
export function hoursAgo(h: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - h * 60 * 60 * 1000);
}

/** Instante de hace `d` días (24 h por día). */
export function daysAgo(d: number, now: Date = new Date()): Date {
  return hoursAgo(d * 24, now);
}

/**
 * Para columnas `@db.Date`: el día de HOY en Argentina como medianoche UTC, que es como Prisma
 * las compara. `new Date()` a secas daría el día equivocado entre las 21 y las 24 h argentinas.
 */
export function argentinaTodayAsUtcDate(): Date {
  return new Date(`${argentinaDate()}T00:00:00.000Z`);
}

/** Claves del filtro virtual `attention` de las listas y de las métricas que lo escriben. */
export type AttentionKey =
  | 'overdue'
  | 'critical'
  | 'preventive'
  | 'date_rejected'
  | 'past_date'
  | 'no_work_orders'
  | 'stuck'
  | 'returned';
