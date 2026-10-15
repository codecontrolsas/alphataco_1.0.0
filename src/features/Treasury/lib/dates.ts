/**
 * Fechas "solo día" de Tesorería (`YYYY-MM-DD`): módulo SIN directiva, lo usan servidor y cliente.
 * Se formatean cortando el texto: nunca pasan por `Date` ni por una zona horaria, así que no
 * pueden correrse de día.
 */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** `YYYY-MM-DD` → `DD/MM/YYYY`. Vacío (null/undefined/'') → ''; un texto que no es un día se devuelve tal cual. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const match = DAY_RE.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** `Date` de una columna `@db.Date` (medianoche UTC) → `YYYY-MM-DD`. */
export function isoDay(value: Date): string;
export function isoDay(value: Date | null | undefined): string | null;
export function isoDay(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
