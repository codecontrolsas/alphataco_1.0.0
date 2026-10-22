import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';

/**
 * Piezas puras para armar el `where` de Prisma de las tablas de Clientes (sin directiva ni acceso
 * a la base: se usan desde los `actions.server.ts`).
 */

/**
 * Filtro de una columna booleana (nullable o no). Los valores de la URL son `'true'`, `'false'` y
 * `NULL_FILTER_VALUE`. Devuelve `undefined` si no hay un valor válido (sin filtro).
 */
export function booleanFilterWhere(field: string, values: readonly string[] | undefined) {
  if (!values || values.length === 0) return undefined;

  const booleans: boolean[] = [];
  if (values.includes('true')) booleans.push(true);
  if (values.includes('false')) booleans.push(false);
  const includesNull = values.includes(NULL_FILTER_VALUE);

  if (booleans.length === 0 && !includesNull) return undefined;

  const clauses: Record<string, unknown>[] = [];
  if (booleans.length > 0) clauses.push({ [field]: { in: booleans } });
  if (includesNull) clauses.push({ [field]: null });
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

/** Solo los dígitos de un texto (CUIT y teléfono se guardan como `bigint`). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Deja en los filtros facetados solo valores válidos para su columna (UUID de una FK, valor de un enum):
 * un valor inventado en la URL llegaría a Prisma y rompería la consulta entera. `NULL_FILTER_VALUE` siempre
 * se conserva. Una clave que queda sin valores se quita (sin filtro).
 */
export function cleanFacetFilters(
  filters: Record<string, string[]>,
  rules: Record<string, (value: string) => boolean>
): Record<string, string[]> {
  const result: Record<string, string[]> = { ...filters };
  for (const [key, isValid] of Object.entries(rules)) {
    const values = result[key];
    if (!values) continue;
    const valid = values.filter((value) => value === NULL_FILTER_VALUE || isValid(value));
    if (valid.length > 0) result[key] = valid;
    else delete result[key];
  }
  return result;
}

/** Filtro de una FK entera (`Int`): números válidos y/o `NULL_FILTER_VALUE`. `undefined` si no hay valor usable. */
export function intFkFilterWhere(field: string, values: readonly string[] | undefined) {
  if (!values || values.length === 0) return undefined;

  const ids = values.filter((value) => /^\d{1,9}$/.test(value)).map(Number);
  const includesNull = values.includes(NULL_FILTER_VALUE);
  if (ids.length === 0 && !includesNull) return undefined;

  const clauses: Record<string, unknown>[] = [];
  if (ids.length > 0) clauses.push({ [field]: { in: ids } });
  if (includesNull) clauses.push({ [field]: null });
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}
