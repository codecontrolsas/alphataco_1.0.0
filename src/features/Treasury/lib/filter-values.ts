import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { isUuid } from '@/shared/lib/uuid';
import moment from 'moment';

/**
 * Parsers de los valores de filtro de las tablas de Tesorería. Todo lo que llega por la URL es
 * texto del usuario: antes de llegar a un cast de SQL (`::date`, `::int`, `::uuid`, `::numeric`)
 * o a Prisma se valida acá, para que un valor inválido nunca termine en un error 500.
 * Función pura, sin dependencias de servidor.
 */

export const INT4_MAX = 2_147_483_647;
const TEXT_MAX_LENGTH = 200;
const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 500;
/** Argentina no tiene horario de verano: el offset es fijo. */
const ARGENTINA_OFFSET = '-03:00';
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** Texto tipeado: recortado, sin NUL (Postgres lo rechaza) y acotado. `null` si queda vacío. */
export function textValue(value: string | undefined | null): string | null {
  if (value == null) return null;
  // eslint-disable-next-line no-control-regex
  const clean = value
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, TEXT_MAX_LENGTH);
  return clean === '' ? null : clean;
}

/**
 * Importe tipeado ("1234,56", "1234.56", "1.234,56") -> texto decimal. `null` si no es un número
 * o no entra en `numeric(15,2)` (13 dígitos enteros).
 */
export function parseAmountText(text: string): string | null {
  const normalized = text
    .trim()
    .replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m))
    .replace(',', '.');
  return /^\d{1,13}(\.\d{1,6})?$/.test(normalized) ? normalized : null;
}

/** `YYYY-MM-DD` si es un día real del calendario (moment estricto) y el año es razonable; si no, `null`. */
export function parseDay(value: string | undefined | null): string | null {
  if (!value) return null;
  const parsed = moment(value, 'YYYY-MM-DD', true);
  if (!parsed.isValid() || parsed.year() < MIN_YEAR || parsed.year() > MAX_YEAR) return null;
  return value;
}

/** Entero >= 0 que entra en un `int` de Postgres; `null` si no. */
export function parseBoundedInt(text: string | undefined | null): number | null {
  const clean = (text ?? '').trim();
  if (!/^\d{1,10}$/.test(clean)) return null;
  const n = Number(clean);
  return n <= INT4_MAX ? n : null;
}

/** skip/take seguros: `page`/`pageSize` vienen de la URL y pueden ser NaN, negativos o enormes. */
export function safePaging(state: { page: number; pageSize: number }): { skip: number; take: number } {
  const take =
    Number.isInteger(state.pageSize) && state.pageSize >= 1
      ? Math.min(state.pageSize, PAGE_SIZE_MAX)
      : PAGE_SIZE_DEFAULT;
  const page = Number.isInteger(state.page) && state.page >= 0 ? state.page : 0;
  return { skip: Math.min(page * take, INT4_MAX), take };
}

/** Lectura de un mapa por clave PROPIA: `map['constructor']` no debe devolver `Object`. */
export function ownEntry<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

type FacetKind = { kind: 'uuid' } | { kind: 'enum'; allowed: readonly string[] };

/**
 * Cláusula Prisma de un filtro facetado. Los valores inválidos (uuid mal formado, enum
 * desconocido) se ignoran; si no queda ninguno, `null` = sin filtro. En columnas `nullable`
 * el centinela de "Sin asignar" filtra los nulos; en las NOT NULL no significa nada y se ignora.
 */
export function facetWhere(
  field: string,
  values: readonly string[] | undefined,
  options: FacetKind & { nullable?: boolean }
): Record<string, unknown> | null {
  const raw = values ?? [];
  const valid = raw.filter((v) =>
    options.kind === 'uuid' ? isUuid(v) : (options.allowed as readonly string[]).includes(v)
  );
  const wantsNull = options.nullable === true && raw.includes(NULL_FILTER_VALUE);
  if (valid.length === 0 && !wantsNull) return null;
  const match = valid.length === 1 ? valid[0] : { in: valid };
  if (wantsNull && valid.length === 0) return { [field]: null };
  if (wantsNull) return { OR: [{ [field]: match }, { [field]: null }] };
  return { [field]: match };
}

type DateRangeColumns = {
  /** Columnas `@db.Date`: el día se toma tal cual (UTC medianoche). */
  dateColumns?: readonly string[];
  /** Columnas `timestamptz`: el día elegido es el día argentino (-03:00). */
  timestampColumns?: readonly string[];
};

/**
 * Rango de fechas de los filtros `<col>_from` / `<col>_to`. Las fechas inválidas se ignoran.
 * No reemplaza al helper compartido: existe porque el compartido interpreta los días en UTC
 * (un alta de las 22:00 argentinas caería en el día siguiente) y deja pasar `2026-02-31`.
 */
export function buildTreasuryDateRangeWhere(
  filters: Record<string, string[]>,
  columns: DateRangeColumns
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  const apply = (columnId: string, toBounds: (day: string, edge: 'from' | 'to') => Date) => {
    const from = parseDay(filters[`${columnId}_from`]?.[0]);
    const to = parseDay(filters[`${columnId}_to`]?.[0]);
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = toBounds(from, 'from');
    if (to) range.lte = toBounds(to, 'to');
    if (range.gte || range.lte) where[columnId] = range;
  };

  for (const id of columns.dateColumns ?? []) apply(id, (day) => new Date(`${day}T00:00:00.000Z`));
  for (const id of columns.timestampColumns ?? []) {
    apply(
      id,
      (day, edge) =>
        new Date(edge === 'from' ? `${day}T00:00:00.000${ARGENTINA_OFFSET}` : `${day}T23:59:59.999${ARGENTINA_OFFSET}`)
    );
  }
  return where;
}
