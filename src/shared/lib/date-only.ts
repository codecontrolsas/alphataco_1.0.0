import moment from 'moment';

/**
 * Columnas `@db.Date` (sin hora) con Prisma: llegan como `Date` a medianoche UTC y se
 * escriben igual. Convertirlas a texto `YYYY-MM-DD` por el día UTC evita que un navegador
 * al oeste de UTC muestre el día anterior; la conversión inversa produce el `Date` que
 * Prisma persiste sin correr el día. `Date` local (del calendario del form) se toma por su
 * fecha LOCAL.
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `Date` de Prisma (o texto ISO) → `'YYYY-MM-DD'`; `null` se conserva. */
export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return value;
    const parsed = moment.utc(value);
    if (!parsed.isValid()) throw new Error(`Fecha inválida: ${value}`);
    return parsed.format('YYYY-MM-DD');
  }
  if (Number.isNaN(value.getTime())) throw new Error('Fecha inválida');
  return moment.utc(value).format('YYYY-MM-DD');
}

/**
 * `'YYYY-MM-DD'` o `Date` local → `Date` a medianoche UTC de ese día (lo que espera una
 * columna `@db.Date`). Un `Date` se toma por su fecha LOCAL: el 15/09 a las 23:30 en UTC-3
 * sigue siendo el 15/09.
 */
export function fromDateOnly(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Fecha inválida');
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (!ISO_DATE_RE.test(value)) throw new Error(`Fecha inválida: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Fecha inválida: ${value}`);
  return parsed;
}

/**
 * Timestamp (`@db.Timestamptz`, ej. `created_at`) → `'YYYY-MM-DD'` del día en la hora LOCAL del
 * servidor. A diferencia de `toDateOnly`, que es para columnas `@db.Date` y toma el día UTC: una
 * emisión a las 22 h en Argentina ya es el día siguiente en UTC.
 */
export function timestampToLocalDateOnly(value: Date): string {
  return moment(value).format('YYYY-MM-DD');
}
