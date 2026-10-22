/**
 * Fecha y hora de negocio en Argentina (UTC-3, sin horario de verano).
 *
 * Fuente única para servidor y navegador: el contenedor puede correr en UTC y el navegador en cualquier
 * zona, pero "hoy", "ayer" y las horas mostradas son siempre las de Argentina. Antes vivían copiadas en
 * `features/Jobs/lib/dates` y `features/Treasury/lib/today` (ambas re-exportan desde acá).
 *
 * Todo el SQL portado calcula el día con `(NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`:
 * resolver la fecha con `new Date()` local haría que el job de las 00:30 AR (03:30 UTC) caiga en un día
 * distinto para el TypeScript y para el SQL.
 */
export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Un `Intl.DateTimeFormat` por llamada cuesta ~40 µs y las listas lo invocan por cada fila (decenas de
// miles por request): se crean una sola vez.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TIME_ZONE });
const DAY_PARTS_FORMAT = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DATE_TIME_PARTS_FORMAT = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function partsOf(format: Intl.DateTimeFormat, value: string | Date) {
  const found = format.formatToParts(new Date(value));
  return (type: Intl.DateTimeFormatPartTypes) => found.find((part) => part.type === type)?.value ?? '';
}

/** `YYYY-MM-DD` del momento dado (o de ahora) en hora argentina. */
export function argentinaDate(at: Date = new Date()): string {
  // `en-CA` formatea como YYYY-MM-DD, que es lo que espera Postgres.
  return DAY_FORMAT.format(at);
}

/** `24/12/2026` a partir de un `YYYY-MM-DD`. */
export function formatDateAr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** `24/12/2026` de una columna `@db.Date` (medianoche UTC): se lee en UTC para no correr un día. */
export function formatDateOnlyAr(value: string | Date): string {
  return formatDateAr(new Date(value).toISOString().slice(0, 10));
}

/** `jueves, 24 de diciembre de 2026` a partir de un `YYYY-MM-DD`. */
export function formatLongDateAr(isoDate: string): string {
  // El mediodía evita que el desplazamiento horario corra el día al construir el Date.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** `DD/MM/YYYY` del día en Argentina de un timestamp (creado, confirmado, anulado). */
export function formatArgentinaDay(value: string | Date): string {
  const get = partsOf(DAY_PARTS_FORMAT, value);
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** `DD/MM/YYYY HH:mm` en hora argentina, igual en el servidor (UTC) y en cualquier navegador. */
export function formatArgentinaDateTime(value: string | Date): string {
  const get = partsOf(DATE_TIME_PARTS_FORMAT, value);
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}
