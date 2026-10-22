import { searchOrderableRequestLines } from '../actions/order-queries.server';
import type { OrderableRequestLineOption } from './order-query-types';

/** Texto de una línea de solicitud con faltante en los combos: solicitud, número de línea y artículo. */
export function lineOptionLabel(option: OrderableRequestLineOption): string {
  return `${option.requestNumber} · línea ${option.position} · ${option.itemLabel}`;
}

/** Búsqueda de líneas pendientes con el formato que pide el combobox (`id` + `label`). */
export async function searchLineOptions(query: string) {
  const result = await searchOrderableRequestLines(query);
  return {
    items: result.items.map((item) => ({ ...item, id: item.requestLineId, label: lineOptionLabel(item) })),
    total: result.total,
  };
}
