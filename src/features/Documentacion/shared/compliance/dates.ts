import { argentinaDate } from '@/shared/lib/argentina-time';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` de hoy en hora argentina. */
export function arToday(now: Date = new Date()): string {
  return argentinaDate(now);
}

/** `YYYY-MM` del mes corriente en hora argentina. */
export function arCurrentPeriod(now: Date = new Date()): string {
  return arToday(now).slice(0, 7);
}

/** Normaliza un período a `YYYY-MM`. Acepta `YYYY-MM` y `MM/YYYY`; cualquier otra cosa → `null`. */
export function normalizePeriod(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})$/.exec(value);
  const ar = /^(\d{1,2})\/(\d{4})$/.exec(value);
  const year = iso ? iso[1] : ar ? ar[2] : null;
  const month = iso ? iso[2] : ar ? ar[1].padStart(2, '0') : null;
  if (!year || !month) return null;
  const m = Number(month);
  if (m < 1 || m > 12) return null;
  return `${year}-${month}`;
}

function isValidIsoDay(day: string): boolean {
  const parsed = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

/**
 * Vencimiento como `YYYY-MM-DD`. `Date` (timestamptz) → día en hora argentina; texto
 * `DD/MM/YYYY` (documentos de empresa) o `YYYY-MM-DD` → se parsea; otro texto con hora → hora AR.
 * Inválido → `null`.
 */
export function parseValidity(raw: Date | string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : argentinaDate(raw);
  const value = raw.trim();
  if (!value) return null;
  const ar = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (ar) {
    const day = `${ar[3]}-${ar[2].padStart(2, '0')}-${ar[1].padStart(2, '0')}`;
    return isValidIsoDay(day) ? day : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isValidIsoDay(value) ? value : null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : argentinaDate(parsed);
}

/** Días entre dos `YYYY-MM-DD` (positivo si `day` es posterior a `today`). */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS);
}
