import { argentinaDate } from '@/shared/lib/argentina-time';

/**
 * Fechas del dashboard principal.
 *
 * Todo el tablero mira "hoy" en hora argentina, no en la del servidor: un parte cargado a las 22:00
 * en Argentina tiene que seguir contando como hoy aunque el proceso corra en UTC. La zona sale de
 * `argentinaDate` (fuente única); acá no hay offsets propios.
 */

/** Argentina no tiene horario de verano: las 00:00 locales son siempre las 03:00 UTC. */
const ARGENTINA_MIDNIGHT_UTC_HOUR = 3;

/** Hoy en hora argentina, como `YYYY-MM-DD`. */
export function getOperationToday(now: Date = new Date()): string {
  return argentinaDate(now);
}

/** Hoy en hora argentina, partido en día/mes/año (los diagramas guardan las 3 columnas). */
export function getTodayParts(now: Date = new Date()): { day: number; month: number; year: number } {
  const [year, month, day] = argentinaDate(now).split('-').map(Number);
  return { day, month, year };
}

/**
 * Instante de las 00:00 hora argentina del día `iso` (`YYYY-MM-DD`). Sirve para cortar columnas
 * `timestamptz` por día argentino (`>= argentinaDayStart(desde)` y `< argentinaDayStart(díaSiguiente)`).
 */
export function argentinaDayStart(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, ARGENTINA_MIDNIGHT_UTC_HOUR));
}

/** Primer instante del mes en curso, en hora argentina. */
export function getStartOfOperationMonth(now: Date = new Date()): Date {
  return argentinaDayStart(`${argentinaDate(now).slice(0, 7)}-01`);
}

/**
 * WHERE común de `dailyreportrows` acotado al parte de una fecha y una empresa.
 * Sin `targetDate` usa el día de la operación.
 */
export function buildTodayReportWhere(companyId: string, targetDate?: string, now: Date = new Date()) {
  const date = targetDate ?? getOperationToday(now);
  return {
    dailyreport: {
      date: new Date(date),
      is_active: true,
      company_id: companyId,
    },
  } as const;
}

/**
 * Estado de fila del parte que NO pone a sus recursos "en operación": el servicio no se hizo.
 * Mismo criterio que los días trabajados de Flota y taller (`drr.status <> 'cancelado'`).
 */
export const CANCELLED_ROW_STATUS = 'cancelado' as const;

/** Estados de una fila del parte que cuentan como servicio del día (los cancelados y reprogramados no). */
export const TODAY_SERVICE_STATUSES = ['pendiente', 'ejecutado'] as const;

/**
 * WHERE único de "servicios del día": filas del parte de esa fecha (por defecto hoy, hora
 * argentina) en estado pendiente o ejecutado, de cualquier tipo y con o sin cliente. Lo comparten
 * la tarjeta, el resumen por tipo y el detalle por cliente, así los tres suman lo mismo.
 */
export function buildTodayServicesWhere(companyId: string, targetDate?: string, now: Date = new Date()) {
  return {
    status: { in: [...TODAY_SERVICE_STATUSES] },
    ...buildTodayReportWhere(companyId, targetDate, now),
  };
}
