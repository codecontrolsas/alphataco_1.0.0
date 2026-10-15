import { ATTENTION_THRESHOLDS, daysAgo } from '@/features/Mantenimiento/lib/attention-thresholds';

/**
 * Condiciones de "Atención" de la lista de equipos con desvíos pendientes.
 *
 * Módulo sin directiva: lo comparten el listado (filtro virtual `attention`), el export, los facets y las
 * métricas. Las cuatro salidas tienen que usar la MISMA condición o la tarjeta dejaría de coincidir con la
 * tabla que filtra al hacer clic.
 *
 * Esta lista no sale de un `findMany` de Prisma sino de un agregado en memoria (ver `actions.server.ts`),
 * así que la condición es un predicado sobre el agregado de cada equipo, no un `where`.
 */

/** Agregado de los desvíos pendientes (sin solicitud) de UN equipo. */
export type DeviationAggregate = {
  count: number;
  /** Desvío pendiente más reciente. */
  lastDeviationDate: Date;
  /** Desvío pendiente más viejo: de acá sale el "más de 30 días sin pedido". */
  firstDeviationDate: Date;
  /** Cuántos de los desvíos pendientes son críticos. */
  criticalCount: number;
};

/** Claves del filtro `attention` que entiende esta lista. */
export const DEVIATION_ATTENTION_KEYS = ['stale', 'critical'] as const;

export type DeviationAttentionKey = (typeof DEVIATION_ATTENTION_KEYS)[number];

export function isDeviationAttentionKey(value: string | null | undefined): value is DeviationAttentionKey {
  return DEVIATION_ATTENTION_KEYS.some((key) => key === value);
}

/**
 * - `stale`: el desvío pendiente más viejo del equipo tiene más de 30 días sin que nadie arme el pedido.
 * - `critical`: el equipo tiene al menos un desvío pendiente marcado como crítico.
 *
 * `now` se inyecta para que el listado y la métrica fijen el mismo instante.
 */
export function matchesDeviationAttention(
  key: DeviationAttentionKey,
  aggregate: DeviationAggregate,
  now: Date = new Date()
): boolean {
  switch (key) {
    case 'stale':
      return aggregate.firstDeviationDate < daysAgo(ATTENTION_THRESHOLDS.deviationsWithoutRequestDays, now);
    case 'critical':
      return aggregate.criticalCount > 0;
  }
}
