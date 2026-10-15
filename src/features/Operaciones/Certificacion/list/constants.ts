/** Prefijo de los params de URL de la tabla (`certification__status`, …). */
export const CERTIFICATION_PARAM_NAMESPACE = 'certification';

/** Clave de persistencia de preferencias (columnas y filtros visibles) de la tabla. */
export const CERTIFICATION_TABLE_ID = 'certification-v1';

/**
 * Prefijo de las queries de la tabla. Se llama así a propósito: el formulario de edición de la línea
 * (`components/hooks/useFormSubmit.ts`) ya invalida `['filtered-daily-report-rows']` al guardar, y esa
 * invalidación por prefijo refresca la tabla sin tocar ese archivo.
 */
export const CERTIFICATION_QUERY_KEY = ['filtered-daily-report-rows'] as const;

/** Prefijo de la query del detalle personal (empleados y equipos) del modal de una línea. */
export const CERTIFICATION_DETAIL_QUERY_KEY = 'certification-row-detail';

/** Filtros visibles por defecto (los mismos que mostraba el tablero anterior). */
export const DEFAULT_VISIBLE_FILTERS = ['customer', 'service', 'item'];
