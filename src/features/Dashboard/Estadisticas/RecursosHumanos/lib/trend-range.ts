import { argentinaDate } from '@/shared/lib/argentina-time';

export type TrendRange = '7d' | '30d' | '90d';

export const TREND_RANGE_DAYS: Record<TrendRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

export interface TrendDateRange {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function shiftIsoDate(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Rango de fechas (YYYY-MM-DD, hora argentina) de un gráfico de tendencia.
 *
 * Con un mes elegido devuelve ese mes recortado a hoy (los días futuros no tienen medición: mostrarlos
 * serían ceros inventados); si el mes es posterior a hoy devuelve `null`. Sin mes, los últimos N días.
 * Nunca supera los 92 días que acepta el servidor.
 */
export function resolveTrendRange(timeRange: TrendRange, selectedMonth?: Date): TrendDateRange | null {
  const today = argentinaDate();

  if (selectedMonth) {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const to = monthEnd < today ? monthEnd : today;
    return from > to ? null : { from, to };
  }

  return { from: shiftIsoDate(today, -TREND_RANGE_DAYS[timeRange]), to: today };
}

export function trendRangeLabel(timeRange: TrendRange, selectedMonth?: Date): string {
  if (selectedMonth) return `${MONTH_NAMES[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;
  return timeRange === '90d' ? '3 meses' : timeRange === '30d' ? '30 días' : '7 días';
}
