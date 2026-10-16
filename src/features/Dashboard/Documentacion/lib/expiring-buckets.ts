/**
 * Agrupación de los próximos vencimientos para la línea de tiempo y las barras por semana.
 * Módulo puro (sin directiva ni servidor): trabaja con "días que faltan" ya calculados en hora argentina.
 *
 * Los datos de partida son las filas de `loadEmployeeExpiringRows` / `loadVehicleExpiringRows`: documentos
 * con vencimiento que ya vencieron o vencen dentro de `EXPIRING_SOON_DAYS` (30) días.
 */

/** Ventana de la línea de tiempo: hoy (día 0) más 30 días. */
export const TIMELINE_DAYS = 30;
/** Semanas que muestra el gráfico semanal (28 días: del 0 al 27). */
export const WEEKS_SHOWN = 4;
const DAYS_PER_WEEK = 7;

export interface ExpiringSeries {
  /** Documentos que ya vencieron. */
  overdue: number;
  /** Cantidad por día, índice = días que faltan (0 = vence hoy). Largo `TIMELINE_DAYS + 1`. */
  byDay: readonly number[];
}

export function bucketExpiringDays(daysLeft: readonly number[]): ExpiringSeries {
  const byDay = Array.from({ length: TIMELINE_DAYS + 1 }, () => 0);
  let overdue = 0;
  for (const days of daysLeft) {
    if (days < 0) overdue += 1;
    else if (days <= TIMELINE_DAYS) byDay[days] += 1;
  }
  return { overdue, byDay };
}

export interface WeekBucket {
  /** 0 = semana en curso (días 0 a 6). */
  index: number;
  fromDay: number;
  toDay: number;
  count: number;
}

/** Cuatro semanas corridas desde hoy. */
export function weeklyBuckets(series: ExpiringSeries): WeekBucket[] {
  return Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const fromDay = index * DAYS_PER_WEEK;
    const toDay = fromDay + DAYS_PER_WEEK - 1;
    return { index, fromDay, toDay, count: series.byDay.slice(fromDay, toDay + 1).reduce((sum, n) => sum + n, 0) };
  });
}

/** Días 28 a 30: quedan dentro de la ventana de 30 días pero fuera de las 4 semanas. */
export function remainderAfterWeeks(series: ExpiringSeries): number {
  return series.byDay.slice(WEEKS_SHOWN * DAYS_PER_WEEK).reduce((sum, n) => sum + n, 0);
}

export function totalUpcoming(series: ExpiringSeries): number {
  return series.byDay.reduce((sum, n) => sum + n, 0);
}

/** "Vence hoy" / "Vence mañana" / "Vence en N días". */
export function dueLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'Vence hoy';
  if (daysLeft === 1) return 'Vence mañana';
  return `Vence en ${daysLeft} días`;
}
