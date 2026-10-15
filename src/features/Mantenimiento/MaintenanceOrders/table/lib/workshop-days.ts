import { argentinaDate } from '@/shared/lib/argentina-time';

const MS_PER_DAY = 86_400_000;

function dayNumber(date: Date): number {
  return Date.parse(`${argentinaDate(date)}T00:00:00Z`) / MS_PER_DAY;
}

/**
 * Días por calendario argentino desde `value` hasta hoy (0 = hoy). Mismo criterio que `RelativeAge`, así
 * la columna "Ingreso a Taller", la banda y el filtro "Más de 14 días" coinciden.
 */
export function daysSinceArgentinaDay(value: Date | string, now: Date = new Date()): number {
  return dayNumber(now) - dayNumber(new Date(value));
}
