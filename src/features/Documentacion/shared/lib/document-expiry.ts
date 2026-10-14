import { argentinaDate, formatDateAr } from '@/features/Jobs/lib/dates';

const DAY_MS = 86_400_000;
/** Un documento "por vencer" es el que vence dentro de este margen. */
export const EXPIRING_SOON_DAYS = 30;

export interface ExpiryInfo {
  /** `DD/MM/YYYY`, o `null` si el documento no tiene vencimiento cargado. */
  date: string | null;
  /** "Vence en 7 días" / "Venció hace 3 días"; `null` cuando no aporta (vence en más de 30 días, o el estado lo hace irrelevante). */
  hint: string | null;
  /** `warn` pide atención (vencido o por vencer); `muted` es informativo. */
  tone: 'warn' | 'muted';
}

/** Días entre dos fechas `YYYY-MM-DD` (positivo si `to` es posterior). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

const plural = (days: number) => `${days} ${days === 1 ? 'día' : 'días'}`;

/**
 * Qué mostrar bajo la fecha de vencimiento de un documento. Todo se calcula en hora argentina
 * (el servidor puede estar en UTC): entre las 21 y las 24 h AR el proceso ya está en "mañana".
 * Un documento pendiente o rechazado no está vigente, así que su vencimiento no se destaca.
 */
export function getExpiryInfo(
  validity: Date | string | null | undefined,
  state: string | null | undefined,
  now: Date = new Date()
): ExpiryInfo {
  if (!validity) return { date: null, hint: null, tone: 'muted' };

  const validityDay = argentinaDate(new Date(validity));
  const date = formatDateAr(validityDay);
  if (state === 'pendiente' || state === 'rechazado') return { date, hint: null, tone: 'muted' };

  const days = daysBetween(argentinaDate(now), validityDay);
  if (days < 0) return { date, hint: `Venció hace ${plural(-days)}`, tone: 'warn' };
  if (days === 0) return { date, hint: 'Vence hoy', tone: 'warn' };
  if (days <= EXPIRING_SOON_DAYS) return { date, hint: `Vence en ${plural(days)}`, tone: 'warn' };
  return { date, hint: null, tone: 'muted' };
}
