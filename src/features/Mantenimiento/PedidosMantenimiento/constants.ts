/**
 * Identificadores de las tablas "Por Programar" y "Por Ingresar". Módulo sin directiva: lo importan el servidor
 * (listas, acciones) y el cliente (tablas, tarjetas de métricas).
 *
 * - `*_TABLE_ID`: clave de las preferencias guardadas (columnas y filtros visibles). El sufijo `-v2` descarta las
 *   preferencias de la tabla anterior, cuyas columnas visibles por defecto cambiaron con el rediseño.
 * - `*_PARAM_NAMESPACE`: prefijo de los parámetros de la URL (`<namespace>__attention`, `<namespace>__status`…).
 *   NO cambia, así los links y marcadores existentes siguen funcionando.
 */
export const PENDING_TABLE_ID = 'pedidos-pendientes-v2';
export const PENDING_PARAM_NAMESPACE = 'pedidos-pendientes';
export const CONFIRMED_TABLE_ID = 'pedidos-confirmados-v2';
export const CONFIRMED_PARAM_NAMESPACE = 'pedidos-confirmados';

/** Claves de React Query de las métricas de cada paso: cuelgan de `['maintenance']` y `invalidateAllMaintenanceQueries` las cubre. */
export const PENDING_METRICS_QUERY_KEY = ['maintenance', 'metrics', 'schedule'] as const;
export const CONFIRMED_ATTENTION_QUERY_KEY = ['maintenance', 'metrics', 'confirmed'] as const;

/**
 * Valores del filtro virtual `attention` de cada lista. La condición de cada uno vive en `lib/order-list-shared.ts`
 * (servidor) y la comparten el listado y las métricas.
 */
export const PENDING_ATTENTION_KEYS = ['overdue', 'date_rejected', 'preventive'] as const;
export type PendingAttentionKey = (typeof PENDING_ATTENTION_KEYS)[number];

export function isPendingAttentionKey(value: string | null | undefined): value is PendingAttentionKey {
  return PENDING_ATTENTION_KEYS.some((key) => key === value);
}

export const CONFIRMED_ATTENTION_KEYS = ['past_date'] as const;
export type ConfirmedAttentionKey = (typeof CONFIRMED_ATTENTION_KEYS)[number];

export function isConfirmedAttentionKey(value: string | null | undefined): value is ConfirmedAttentionKey {
  return CONFIRMED_ATTENTION_KEYS.some((key) => key === value);
}
