import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';

/** ¿La URL trae algún parámetro de esa tabla (`<tableId>__<columna>`)? Módulo SIN directiva: lo usan servidor y cliente. */
export function hasTableParams(params: Record<string, unknown>, tableId: string): boolean {
  const prefix = `${tableId}${PARAM_SEPARATOR}`;
  return Object.keys(params).some((key) => key.startsWith(prefix));
}

/**
 * Devuelve los searchParams con el filtro por defecto de la tabla SOLO si la URL no trae ninguno de la
 * tabla. Conserva todos los demás parámetros tal como llegan (los que vienen como arreglo también):
 * no hay redirect, el servidor consulta ya con el filtro aplicado.
 */
export function withDefaultTableFilter(
  searchParams: DataTableSearchParams,
  tableId: string,
  columnId: string,
  value: string
): DataTableSearchParams {
  if (hasTableParams(searchParams, tableId)) return searchParams;
  return { ...searchParams, [`${tableId}${PARAM_SEPARATOR}${columnId}`]: value };
}
