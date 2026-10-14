/**
 * Fecha del parte como `YYYY-MM-DD` sin desfase de zona horaria: la columna es `@db.Date`
 * (medianoche UTC), así que se leen los campos UTC y no los locales.
 */
export function toReportDateString(rawDate: Date | string): string {
  if (rawDate instanceof Date) {
    return `${rawDate.getUTCFullYear()}-${String(rawDate.getUTCMonth() + 1).padStart(2, '0')}-${String(rawDate.getUTCDate()).padStart(2, '0')}`;
  }
  return String(rawDate).slice(0, 10);
}
