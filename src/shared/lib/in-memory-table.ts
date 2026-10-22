import { argentinaDate } from '@/shared/lib/argentina-time';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableState } from '@/shared/components/common/DataTable/types';

/**
 * Pipeline "en memoria" para tablas cuyas filas no salen de una consulta Prisma sino de un cálculo
 * (p. ej. el cumplimiento documental: filas faltantes que no existen en la base).
 *
 * Opt-in: no toca el DataTable compartido. Consume el MISMO estado que ya parsea
 * `parseSearchParams` (`search`, `sorting`, `page`, `pageSize` y `filters` con los sufijos
 * `_from` / `_to` de los rangos de fecha), así que el formato de URL no cambia.
 *
 * Sin Prisma y sin directiva: lo puede importar cualquier módulo del servidor.
 */

// ============================================================================
// TIPOS
// ============================================================================

/** Valor de una faceta: `id` es lo que viaja en la URL; `name` es la etiqueta de la opción (si la hay). */
export interface FacetEntry {
  id: string;
  name?: string | null;
}

type Scalar = string | number | Date | null | undefined;
type TextValues = ReadonlyArray<string | null | undefined>;

export interface InMemoryTableSpec<Row> {
  /** Identidad estable de la fila: desempate final del orden. */
  rowId: (row: Row) => string;
  /** Búsqueda global: `contains` por subcadena (sin acentos); `exact` por igualdad (p. ej. legajo). */
  search?: { contains?: (row: Row) => TextValues; exact?: (row: Row) => TextValues };
  /** Filtros de texto libre (subcadena, sin acentos), por columna. */
  textFilters?: Record<string, (row: Row) => TextValues>;
  /** Filtros de texto de coincidencia exacta (legajo), por columna. */
  exactFilters?: Record<string, (row: Row) => TextValues>;
  /**
   * Filtros facetados. La fila devuelve sus valores; una lista vacía (o un `null`) cuenta como
   * "sin valor" y se filtra con `NULL_FILTER_VALUE`. Una fila con varios valores (M:M) suma en cada uno.
   */
  facets?: Record<string, (row: Row) => ReadonlyArray<FacetEntry | null>>;
  /** Filtros de rango de fechas: la fila devuelve un `Date` (se toma el día argentino) o un `YYYY-MM-DD`. */
  dateRanges?: Record<string, (row: Row) => Date | string | null | undefined>;
  /** Valor por el que ordena cada columna. Una columna ausente acá no se puede ordenar. */
  sorters?: Record<string, (row: Row) => Scalar>;
  /** Orden por defecto: desempate después del orden elegido por el usuario (siempre ascendente). */
  defaultSort?: ReadonlyArray<(row: Row) => Scalar>;
}

export interface FacetCountsResult {
  counts: Map<string, number>;
  /** Opciones con etiqueta (solo las facetas que informan `name`), ordenadas alfabéticamente. */
  options: Array<{ id: string; name: string }>;
}

// ============================================================================
// NORMALIZACIÓN
// ============================================================================

const DIACRITICS = /[̀-ͯ]/g;

/** Minúsculas y sin acentos: "Ñandú" y "nandu" se buscan igual. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

function normalizedValues(values: TextValues): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = normalizeSearchText(String(value));
    if (normalized) result.push(normalized);
  }
  return result;
}

/** Un valor de filtro de texto puede traer comas (la URL los parte por coma): se vuelve a unir. */
function textFilterValue(state: DataTableState, columnId: string): string {
  const values = state.filters[columnId];
  return values && values.length > 0 ? normalizeSearchText(values.join(',')) : '';
}

/** `YYYY-MM-DD` de un `Date` (día argentino) o de un texto ya en ese formato. */
function toDay(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  return Number.isNaN(value.getTime()) ? null : argentinaDate(value);
}

// ============================================================================
// FILTRADO
// ============================================================================

type RowPredicate<Row> = (row: Row) => boolean;

/** Arma los predicados de todos los filtros activos, salvo los de `excludeColumn` (cross-filter). */
function compileFilters<Row>(
  state: DataTableState,
  spec: InMemoryTableSpec<Row>,
  excludeColumn?: string
): Array<RowPredicate<Row>> {
  const predicates: Array<RowPredicate<Row>> = [];

  // ─── Búsqueda global ───────────────────────────────────────────────────────
  const term = normalizeSearchText(state.search ?? '');
  const searchSpec = spec.search;
  if (term && searchSpec && (searchSpec.contains || searchSpec.exact)) {
    const { contains, exact } = searchSpec;
    predicates.push((row) => {
      if (contains && normalizedValues(contains(row)).some((v) => v.includes(term))) return true;
      if (exact && normalizedValues(exact(row)).some((v) => v === term)) return true;
      return false;
    });
  }

  // ─── Texto libre (subcadena) ───────────────────────────────────────────────
  for (const [columnId, extract] of Object.entries(spec.textFilters ?? {})) {
    if (columnId === excludeColumn) continue;
    const needle = textFilterValue(state, columnId);
    if (!needle) continue;
    predicates.push((row) => normalizedValues(extract(row)).some((v) => v.includes(needle)));
  }

  // ─── Texto exacto (legajo) ─────────────────────────────────────────────────
  for (const [columnId, extract] of Object.entries(spec.exactFilters ?? {})) {
    if (columnId === excludeColumn) continue;
    const needle = textFilterValue(state, columnId);
    if (!needle) continue;
    predicates.push((row) => normalizedValues(extract(row)).some((v) => v === needle));
  }

  // ─── Facetados ─────────────────────────────────────────────────────────────
  for (const [columnId, extract] of Object.entries(spec.facets ?? {})) {
    if (columnId === excludeColumn) continue;
    const selected = state.filters[columnId];
    if (!selected || selected.length === 0) continue;
    const wanted = new Set(selected);
    predicates.push((row) => facetKeys(extract(row)).some((key) => wanted.has(key)));
  }

  // ─── Rangos de fecha (días argentinos, ambos extremos inclusive) ───────────
  for (const [columnId, extract] of Object.entries(spec.dateRanges ?? {})) {
    if (columnId === excludeColumn) continue;
    const from = toDay(state.filters[`${columnId}_from`]?.[0]);
    const to = toDay(state.filters[`${columnId}_to`]?.[0]);
    if (!from && !to) continue;
    predicates.push((row) => {
      const day = toDay(extract(row));
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }

  // Cualquier otra clave de `state.filters` (tab, subtab, filtros de otras tablas...) se ignora.
  return predicates;
}

/** Claves de una faceta para una fila: ids únicos, o `NULL_FILTER_VALUE` si no tiene ninguno. */
function facetKeys(entries: ReadonlyArray<FacetEntry | null>): string[] {
  const keys = new Set<string>();
  for (const entry of entries) keys.add(entry ? entry.id : NULL_FILTER_VALUE);
  if (keys.size === 0) keys.add(NULL_FILTER_VALUE);
  return [...keys];
}

// ============================================================================
// ORDEN
// ============================================================================

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function comparable(value: Scalar): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  return value;
}

/** Compara dos valores ascendente; los nulos van siempre al final. */
function compareScalars(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Ordena de forma estable: primero los criterios del usuario (multi-sort), después `defaultSort`
 * y, por último, el id de la fila. Las columnas sin sorter se ignoran.
 */
function sortRows<Row>(rows: Row[], state: DataTableState, spec: InMemoryTableSpec<Row>): Row[] {
  const userSorts = state.sorting.flatMap((s) => {
    const extract = spec.sorters?.[s.id];
    return extract ? [{ extract, desc: s.desc }] : [];
  });
  const defaults = spec.defaultSort ?? [];

  // Se calcula la clave de cada fila UNA vez (decorate-sort-undecorate).
  const decorated = rows.map((row) => ({
    row,
    id: spec.rowId(row),
    user: userSorts.map((s) => comparable(s.extract(row))),
    fallback: defaults.map((extract) => comparable(extract(row))),
  }));

  decorated.sort((a, b) => {
    for (let i = 0; i < userSorts.length; i += 1) {
      const diff = compareScalars(a.user[i], b.user[i]);
      if (diff !== 0) {
        // Los nulos siguen al final aunque el orden sea descendente.
        const bothPresent = a.user[i] !== null && b.user[i] !== null;
        return userSorts[i].desc && bothPresent ? -diff : diff;
      }
    }
    for (let i = 0; i < defaults.length; i += 1) {
      const diff = compareScalars(a.fallback[i], b.fallback[i]);
      if (diff !== 0) return diff;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return decorated.map((d) => d.row);
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/** Aplica búsqueda, filtros y orden del estado de la tabla. No pagina. */
export function applyTableState<Row>(
  rows: readonly Row[],
  state: DataTableState,
  spec: InMemoryTableSpec<Row>
): Row[] {
  const predicates = compileFilters(state, spec);
  const filtered = predicates.length === 0 ? [...rows] : rows.filter((row) => predicates.every((p) => p(row)));
  return sortRows(filtered, state, spec);
}

/** Recorta la página del estado (`page` es 0-indexed). */
export function paginate<Row>(rows: readonly Row[], state: DataTableState): Row[] {
  const start = state.page * state.pageSize;
  return rows.slice(start, start + state.pageSize);
}

/**
 * Conteos de UNA faceta con cross-filter: se aplican todos los filtros y la búsqueda MENOS el filtro
 * de la propia columna, para que sus opciones no se achiquen al elegir una. Devuelve también las
 * opciones con etiqueta que aparecen en ese universo.
 */
export function facetCounts<Row>(
  rows: readonly Row[],
  state: DataTableState,
  spec: InMemoryTableSpec<Row>,
  columnId: string
): FacetCountsResult | null {
  const extract = spec.facets?.[columnId];
  if (!extract) return null;

  const predicates = compileFilters(state, spec, columnId);
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const row of rows) {
    if (!predicates.every((p) => p(row))) continue;
    const entries = extract(row);
    for (const entry of entries) {
      if (entry?.name) labels.set(entry.id, entry.name);
    }
    for (const key of facetKeys(entries)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const options = [...labels.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { counts, options };
}
