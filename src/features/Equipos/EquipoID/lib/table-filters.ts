import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { isUuid } from '@/shared/lib/uuid';

/**
 * Utilidades puras para armar los `where` de las tablas de la ficha del equipo (historial de mantenimiento,
 * solicitudes rechazadas y checklists). Sin directiva: se importan desde Server Actions.
 */

/** UUID nulo: no existe ningún registro con este id. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Los filtros que llegan de la URL son texto libre: un id mal formado en un `in` de una columna `uuid` hace
 * fallar la consulta entera. Se descartan los valores inválidos (se conserva "Sin asignar"); si ninguno
 * sobrevive, el filtro apunta al UUID nulo para que devuelva 0 filas en vez de ignorarse.
 */
export function sanitizeUuidFilters(
  filters: Record<string, string[]>,
  uuidColumns: readonly string[]
): Record<string, string[]> {
  const sanitized = { ...filters };

  for (const column of uuidColumns) {
    const values = sanitized[column];
    if (!values?.length) continue;

    const valid = values.filter((value) => value === NULL_FILTER_VALUE || isUuid(value));
    sanitized[column] = valid.length > 0 ? valid : [NIL_UUID];
  }

  return sanitized;
}

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseArgentinaBoundary(day: string | undefined, time: string): Date | undefined {
  if (!day || !ISO_DAY_PATTERN.test(day)) return undefined;
  const date = new Date(`${day}T${time}-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Rango `gte`/`lte` de una columna `timestamptz` a partir de los params `<columna>_from` / `<columna>_to`
 * (`YYYY-MM-DD`), con los límites del día en hora argentina (UTC-3). Devuelve `undefined` si no hay rango.
 *
 * `buildDateRangeFiltersWhere` usa medianoche UTC: un registro de las 22:00 en Argentina caería en el día
 * siguiente. Para columnas con hora se usa este helper.
 */
export function argentinaDateRange(
  filters: Record<string, string[]>,
  columnId: string
): { gte?: Date; lte?: Date } | undefined {
  const gte = parseArgentinaBoundary(filters[`${columnId}_from`]?.[0], '00:00:00.000');
  const lte = parseArgentinaBoundary(filters[`${columnId}_to`]?.[0], '23:59:59.999');
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** Valor del filtro de texto de una columna (primer valor no vacío) o `undefined`. */
export function textFilterValue(filters: Record<string, string[]>, columnId: string): string | undefined {
  const value = filters[columnId]?.[0]?.trim();
  return value ? value : undefined;
}
