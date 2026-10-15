import { ATTENTION_THRESHOLDS, argentinaTodayAsUtcDate, daysAgo, type AttentionKey } from '../lib/attention-thresholds';

/**
 * Condiciones del filtro virtual `attention` de Seguimiento.
 *
 * Módulo sin directiva: lo comparten el listado (`actions.server.ts`) y las métricas
 * (`actions/metrics.server.ts`), así cada tarjeta cuenta EXACTAMENTE lo que filtra la tabla (D-4).
 * Un archivo `'use server'` no puede exportar funciones síncronas, por eso viven acá.
 */

type WhereCondition = Record<string, unknown>;

/** Claves de `attention` que Seguimiento sabe resolver. */
export const TRACKING_ATTENTION_KEYS = ['overdue', 'past_date'] as const satisfies readonly AttentionKey[];
export type TrackingAttentionKey = (typeof TRACKING_ATTENTION_KEYS)[number];

export function isTrackingAttentionKey(value: string | undefined): value is TrackingAttentionKey {
  return !!value && (TRACKING_ATTENTION_KEYS as readonly string[]).includes(value);
}

/**
 * - `overdue`: en taller hace más de `inWorkshopDays` días (desde el ingreso).
 * - `past_date`: con fecha confirmada que ya pasó sin que se registre el ingreso.
 */
export function trackingAttentionCondition(key: TrackingAttentionKey, now: Date = new Date()): WhereCondition {
  switch (key) {
    case 'overdue':
      return {
        status: 'in_workshop',
        workshop_entry_date: { lt: daysAgo(ATTENTION_THRESHOLDS.inWorkshopDays, now) },
      };
    case 'past_date':
      return {
        status: 'date_confirmed',
        scheduled_date: { lt: argentinaTodayAsUtcDate() },
      };
  }
}

/** D-5: pedidos que el taller rechazó antes de programarlos, dentro de la ventana de aviso. */
export function recentTrackingRejectionCondition(now: Date = new Date()): WhereCondition {
  return {
    status: 'rejected',
    rejected_at: { gte: daysAgo(ATTENTION_THRESHOLDS.recentRejectionDays, now) },
  };
}
