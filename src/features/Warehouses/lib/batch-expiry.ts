/**
 * Clasificacion de un lote por su vencimiento (spec etapa 2 §3.3 y §4).
 *
 * Fechas como `YYYY-MM-DD` en hora argentina: el motor (bloqueo de salidas), el aviso en
 * pantalla y el mail semanal usan la MISMA referencia de "hoy" (`argentinaDate()` de
 * `features/Jobs/lib/dates.ts`). Si cada uno calculara el dia por su cuenta, un lote podria
 * estar vencido para el mail y vigente para el formulario el mismo dia.
 *
 * Un lote que vence HOY todavia no esta vencido: vence al terminar el dia.
 */

export const EXPIRING_WINDOW_DAYS = 30;

export type BatchExpiryStatus = 'EXPIRED' | 'EXPIRING' | 'OK';

const DAY_MS = 86_400_000;

/** Dias de `fromYmd` a `toYmd` (`YYYY-MM-DD`), negativos si `toYmd` es anterior. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);
}

/** `expiresOn` y `today` como `YYYY-MM-DD`. Sin vencimiento, el lote siempre esta vigente. */
export function classifyBatch(expiresOn: string | null, today: string): BatchExpiryStatus {
  if (!expiresOn) return 'OK';
  const days = daysBetween(today, expiresOn);
  if (days < 0) return 'EXPIRED';
  if (days <= EXPIRING_WINDOW_DAYS) return 'EXPIRING';
  return 'OK';
}

/** `YYYY-MM-DD` de una columna `@db.Date` (Prisma la entrega a medianoche UTC). */
export function dateColumnToYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}
