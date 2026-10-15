/** Prefijo de los params de URL de la tabla del detalle (`<namespace>__<columna>`). */
export const DETAIL_PARAM_NAMESPACE = 'daily-report-detail';

/**
 * Clave de persistencia de preferencias (columnas y filtros visibles) de la tabla del detalle.
 * Es `-v2` a propósito: las preferencias guardadas ganan sobre los ocultos por defecto, y el rediseño
 * cambió qué columnas se ven. Distinta del namespace de la URL.
 */
export const DETAIL_PREFS_ID = 'daily-report-detail-v2';

/** Prefijo de las queries del detalle: las invalidaciones existentes (`invalidateDetail`) la refrescan. */
export const DETAIL_QUERY_PREFIX = 'daily-report-detail';
