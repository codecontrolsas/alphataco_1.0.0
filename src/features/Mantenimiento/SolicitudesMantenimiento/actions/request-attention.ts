import type { Prisma } from '@/generated/prisma/client';
import { ATTENTION_THRESHOLDS, hoursAgo, type AttentionKey } from '../../lib/attention-thresholds';

/**
 * Condiciones de "Atención" de la lista de solicitudes por validar.
 *
 * Módulo sin directiva ni `server-only`: lo comparten el listado (filtro virtual `attention`), las
 * métricas, el contador del pipeline y la banda de atención, y las cuatro cifras tienen que salir de la
 * MISMA condición o la métrica dejaría de coincidir con la tabla que filtra al hacer clic.
 */

/** Claves del filtro `attention` que entiende esta lista. */
export const REQUEST_ATTENTION_KEYS = ['overdue', 'critical', 'preventive'] as const satisfies readonly AttentionKey[];

export type RequestAttentionKey = (typeof REQUEST_ATTENTION_KEYS)[number];

export function isRequestAttentionKey(value: string | null | undefined): value is RequestAttentionKey {
  return REQUEST_ATTENTION_KEYS.some((key) => key === value);
}

/**
 * Condición Prisma de cada clave de atención.
 * - `overdue`: esperan validación hace más de 48 h (desde `created_at`).
 * - `critical`: tiene al menos un desvío marcado como crítico.
 * - `preventive`: nace del programa de mantenimiento preventivo.
 *
 * `now` se inyecta para que el listado y la métrica puedan fijar el mismo instante.
 */
export function requestAttentionCondition(
  key: RequestAttentionKey,
  now: Date = new Date()
): Prisma.maintenance_requestsWhereInput {
  switch (key) {
    case 'overdue':
      return { created_at: { lt: hoursAgo(ATTENTION_THRESHOLDS.requestPendingHours, now) } };
    case 'critical':
      return { maintenance_request_items: { some: { checklist_deviations: { is_critical: true } } } };
    case 'preventive':
      return { source: 'preventive' };
  }
}
