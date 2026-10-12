import { ARGENTINA_TIME_ZONE, argentinaDate } from '@/features/Jobs/lib/dates';

/**
 * "Hoy" de Tesorería: la fecha en hora argentina, no la del proceso. El contenedor de la app
 * puede correr en UTC, y entre las 21:00 y las 24:00 (AR) ya sería "mañana": un e-cheq con fecha
 * de mañana entraría al saldo antes de tiempo. Mismo criterio que la fecha de negocio de los jobs.
 * Vale también en el navegador: "hoy" es el de Argentina aunque el equipo esté en otra zona.
 */
export function treasuryToday(at: Date = new Date()): string {
  return argentinaDate(at);
}

const parts = (value: string | Date, options: Intl.DateTimeFormatOptions) => {
  const found = new Intl.DateTimeFormat('es-AR', { timeZone: ARGENTINA_TIME_ZONE, hourCycle: 'h23', ...options }).formatToParts(new Date(value));
  return (type: Intl.DateTimeFormatPartTypes) => found.find((p) => p.type === type)?.value ?? '';
};

/** `DD/MM/YYYY` del día en Argentina de un timestamp (creado, confirmado, anulado). */
export function formatArgentinaDay(value: string | Date): string {
  const get = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** `DD/MM/YYYY HH:mm` en hora argentina, igual en el servidor (UTC) y en cualquier navegador. */
export function formatArgentinaDateTime(value: string | Date): string {
  const get = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}
