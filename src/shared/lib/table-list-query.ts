import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, SortItem } from '@/shared/components/common/DataTable/types';
import { sanitizeFilters } from '@/shared/lib/table-filters';
import { isUuid } from '@/shared/lib/uuid';

/**
 * Piezas comunes de las consultas de listas con DataTable server-side (compras, almacenes, tesorería):
 * validación de los filtros que llegan por la URL, orden y conteo de relaciones M:M. Funciones puras,
 * sin Prisma: el `where` y el `select` de cada lista siguen siendo del módulo que la define.
 */

/** Igual que `isUuid`, pero también acepta el centinela de "Sin asignar". */
export const isUuidOrNull = (value: string): boolean => value === NULL_FILTER_VALUE || isUuid(value);

/** Valores permitidos de una columna con lista cerrada (un valor ajeno haría fallar a Prisma). */
export const isOneOf =
  (allowed: readonly string[]) =>
  (value: string): boolean =>
    allowed.includes(value);

/** Condición `contains` sin distinguir mayúsculas, para los buscadores de texto. */
export const containsInsensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/** Nombre a mostrar de un perfil: nombre completo, si no el correo, si no un guion. */
export const profileDisplayName = (profile: { fullname: string | null; email: string | null }): string =>
  profile.fullname ?? profile.email ?? '-';

/**
 * Estado de la tabla ya parseado, con solo los filtros permitidos y, en las columnas con validador,
 * solo los valores válidos (si no queda ninguno, el filtro se descarta).
 */
export function parseValidatedListState(
  searchParams: DataTableSearchParams,
  allowedKeys: ReadonlySet<string>,
  validValues: Record<string, (value: string) => boolean>
) {
  const state = sanitizeFilters(parseSearchParams(searchParams), allowedKeys);
  for (const [column, isValid] of Object.entries(validValues)) {
    const values = state.filters[column];
    if (!values) continue;
    const valid = values.filter(isValid);
    if (valid.length > 0) state.filters[column] = valid;
    else delete state.filters[column];
  }
  return state;
}

type SortDirection = 'asc' | 'desc';

/**
 * Traduce el orden de la URL a `orderBy` de Prisma. `custom` resuelve las columnas que no son un campo
 * directo (FK, estado derivado, nulos al final) y tiene prioridad; `directFields` son los campos
 * ordenables tal cual. Lo que no esté en ninguno de los dos se ignora.
 */
export function resolveSorts<OrderBy>(
  sorting: readonly SortItem[],
  directFields: ReadonlySet<string>,
  custom: Record<string, (dir: SortDirection) => OrderBy | OrderBy[]> = {}
): OrderBy[] {
  const resolved: OrderBy[] = [];
  for (const sort of sorting) {
    const dir: SortDirection = sort.desc ? 'desc' : 'asc';
    const mapper = Object.hasOwn(custom, sort.id) ? custom[sort.id] : undefined;
    if (mapper) {
      const mapped = mapper(dir);
      resolved.push(...(Array.isArray(mapped) ? (mapped as OrderBy[]) : [mapped as OrderBy]));
    } else if (directFields.has(sort.id)) resolved.push({ [sort.id]: dir } as OrderBy);
  }
  return resolved;
}

type NumberedRef = { id: string; number: string };

/**
 * Faceta de una relación M:M (por ejemplo, la solicitud de origen de cada cotización): cuenta en cuántos
 * registros distintos aparece cada elemento y devuelve las opciones ordenadas por número.
 * `groups` trae, por cada registro, los elementos relacionados (puede repetir elementos).
 */
export function countDistinctRelations(groups: Iterable<Iterable<NumberedRef>>) {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const group of groups) {
    const seen = new Set<string>();
    for (const item of group) {
      names.set(item.id, item.number);
      if (!seen.has(item.id)) {
        seen.add(item.id);
        counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
      }
    }
  }
  const resolvedOptions = [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { counts, resolvedOptions };
}

/** Elementos distintos (por id) de una lista, ordenados por número. */
export function uniqueSortedByNumber(items: Iterable<NumberedRef>): NumberedRef[] {
  const unique = new Map<string, NumberedRef>();
  for (const item of items) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => a.number.localeCompare(b.number));
}

/** Resultado de la faceta de UNA columna (carga perezosa): conteos y, si la columna es FK, sus opciones. */
export type SingleFacetResult = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null;
