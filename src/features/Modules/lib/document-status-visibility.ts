/**
 * Con el módulo `documentacion` apagado, el `status` de empleados y equipos (caché del cumplimiento documental, congelado
 * mientras está apagado) no se muestra: ni la columna ni su filtro. Las tablas de cliente reciben `showDocumentStatus`
 * calculado en el servidor (`isModuleEnabled('documentacion')`), sin provider de cliente (F3.2).
 */

/** Sin la columna `status` cuando `show` es falso. */
export function withDocumentStatusColumn<T extends { id?: string; accessorKey?: unknown }>(
  columns: T[],
  show: boolean
): T[] {
  return show ? columns : columns.filter((column) => column.id !== 'status' && column.accessorKey !== 'status');
}

/** Sin el filtro de `status` cuando `show` es falso. */
export function withDocumentStatusFacet<T extends { columnId: string }>(facets: T[], show: boolean): T[] {
  return show ? facets : facets.filter((facet) => facet.columnId !== 'status');
}

/** Sin `status` entre los filtros visibles de entrada cuando `show` es falso. */
export function withDocumentStatusDefault(columnIds: string[], show: boolean): string[] {
  return show ? columnIds : columnIds.filter((id) => id !== 'status');
}
