/**
 * Tipos compartidos entre las server actions y los clientes de las listas de documentos
 * (empleados y equipos, permanentes y mensuales). Sin directiva: los importan los dos lados.
 */

/** Resultado de la faceta de UNA columna: conteos con cross-filter y, si aplica, opciones con nombre. */
export type DocumentListFacet = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
};

/** Subtabs de permisos de las 4 listas (los mismos `tabSlug` de los TabContent y de las fichas). */
export type DocumentListTab =
  | 'docs-empleados-permanentes'
  | 'docs-empleados-mensuales'
  | 'docs-equipos-permanentes'
  | 'docs-equipos-mensuales';

/** Tope de filas de una exportación (Excel o ZIP): más que eso se rechaza pidiendo acotar con filtros. */
export const MAX_EXPORT_ROWS = 10_000;
