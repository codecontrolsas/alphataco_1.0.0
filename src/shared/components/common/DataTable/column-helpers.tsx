'use client';

import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { FilterFn } from '@tanstack/react-table';

/**
 * Título de columna: lo que lee el selector de columnas (`meta.title`) y el encabezado ordenable. Se
 * esparce en la definición (`{ id, accessorKey, ...titled('Número'), cell }`) para no repetir las dos
 * líneas en cada columna.
 */
export function titled(title: string) {
  return {
    meta: { title },
    // El encabezado solo usa `column`: no depende de la fila, así que sirve para cualquier tabla.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    header: ({ column }: { column: any }) => <DataTableColumnHeader column={column} title={title} />,
  };
}

/** Filtro por valor del propio accessor de la columna (enum, estado): `value` son los valores elegidos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const matchesColumnValue: FilterFn<any> = (row, id, value: string[]) =>
  value.includes(row.getValue(id) as string);

/** Filtro por el id de una relación de la fila (proveedor, creador…). */
export const matchesId =
  <TData,>(getId: (row: TData) => string | number | boolean): FilterFn<TData> =>
  (row, _id, value: string[]) =>
    value.includes(String(getId(row.original)));

/** Igual que `matchesId`, pero una relación ausente coincide con el filtro "Sin asignar". */
export const matchesNullableId =
  <TData,>(getId: (row: TData) => string | null | undefined): FilterFn<TData> =>
  (row, _id, value: string[]) => {
    const id = getId(row.original);
    return id == null ? value.includes(NULL_FILTER_VALUE) : value.includes(id);
  };

/** Filtro por relación M:M: coincide si alguno de los ids de la fila está elegido. */
export const matchesAnyId =
  <TData,>(getIds: (row: TData) => string[]): FilterFn<TData> =>
  (row, _id, value: string[]) =>
    getIds(row.original).some((id) => value.includes(id));

/** Igual que `matchesAnyId`, pero una fila sin ninguno coincide con "Sin asignar". */
export const matchesAnyIdOrNone =
  <TData,>(getIds: (row: TData) => string[]): FilterFn<TData> =>
  (row, _id, value: string[]) => {
    const ids = getIds(row.original);
    return ids.length === 0 ? value.includes(NULL_FILTER_VALUE) : ids.some((id) => value.includes(id));
  };
