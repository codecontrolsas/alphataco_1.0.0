/**
 * Identificadores de la tabla "Validar Solicitud". Módulo sin directiva: lo importan el servidor y el cliente.
 *
 * - `REQUESTS_TABLE_ID`: clave de las preferencias guardadas (columnas y filtros visibles). El sufijo `-v2` descarta
 *   las preferencias de la tabla anterior, cuyas columnas ya no existen tal cual.
 * - `REQUESTS_PARAM_NAMESPACE`: prefijo de los parámetros de la URL (`<namespace>__attention`, `<namespace>__status`…).
 *   NO cambia, así los links y bookmarks existentes siguen funcionando.
 */
export const REQUESTS_TABLE_ID = 'maintenance-requests-v2';
export const REQUESTS_PARAM_NAMESPACE = 'maintenance-requests';

/** Clave de React Query de las métricas del paso: cuelga de `['maintenance']` y `invalidateAllMaintenanceQueries` la cubre. */
export const REQUEST_METRICS_QUERY_KEY = ['maintenance', 'metrics', 'validate'] as const;
