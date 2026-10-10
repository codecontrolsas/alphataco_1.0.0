import { argentinaDate } from '@/features/Jobs/lib/dates';

/**
 * "Hoy" de Tesorería: la fecha en hora argentina, no la del proceso. El contenedor de la app
 * puede correr en UTC, y entre las 21:00 y las 24:00 (AR) ya sería "mañana": un e-cheq con fecha
 * de mañana entraría al saldo antes de tiempo. Mismo criterio que la fecha de negocio de los jobs.
 */
export function treasuryToday(at: Date = new Date()): string {
  return argentinaDate(at);
}
