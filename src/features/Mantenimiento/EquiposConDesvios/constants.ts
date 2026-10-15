/**
 * Identificadores de la tabla "Equipos con Desvíos". Módulo sin directiva: lo importan el servidor y el cliente.
 *
 * - `DEVIATIONS_TABLE_ID`: clave de las preferencias guardadas (columnas y filtros visibles). El sufijo `-v2`
 *   descarta las preferencias de la tabla anterior, cuyas columnas ya no son las mismas.
 * - `DEVIATIONS_PARAM_NAMESPACE`: prefijo de los parámetros de la URL (`<namespace>__attention`, `<namespace>__type`…).
 *   NO cambia, así los links y bookmarks existentes siguen funcionando.
 */
export const DEVIATIONS_TABLE_ID = 'equipments-with-deviations-v2';
export const DEVIATIONS_PARAM_NAMESPACE = 'equipments-with-deviations';

/** Clave de React Query de la tabla (la invalida `invalidateAllMaintenanceQueries` junto con el resto del módulo). */
export const DEVIATIONS_LIST_QUERY_KEY = ['equipments-with-deviations-list'] as const;

/** Clave de React Query de las métricas: cuelga de `['maintenance']` y `invalidateAllMaintenanceQueries` la cubre. */
export const DEVIATIONS_METRICS_QUERY_KEY = ['maintenance', 'metrics', 'desvios'] as const;
