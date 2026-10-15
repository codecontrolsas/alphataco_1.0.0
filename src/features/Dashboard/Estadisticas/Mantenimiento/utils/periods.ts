import { argentinaDayStart } from '@/features/Dashboard/Principal/lib/dashboard-dates';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import 'moment/locale/es';

/**
 * Cortes temporales pedidos en los tickets 680 y 682: "día / mensual /
 * trimestre / anual". El usuario elige la granularidad y navega período a
 * período con las flechas; el gráfico siempre muestra UN período.
 */
export type PeriodGranularity = 'day' | 'month' | 'quarter' | 'year';

export const PERIOD_GRANULARITIES: readonly PeriodGranularity[] = ['day', 'month', 'quarter', 'year'] as const;

export const PERIOD_GRANULARITY_LABELS: Record<PeriodGranularity, string> = {
  day: 'Día',
  month: 'Mes',
  quarter: 'Trimestre',
  year: 'Año',
};

/** Formato del ancla: una fecha CUALQUIERA dentro del período seleccionado. */
export const PERIOD_ANCHOR_FORMAT = 'YYYY-MM-DD';

/** Ancla de hoy — punto de partida por defecto de los selectores. */
export function todayAnchor(): string {
  // Hoy en hora argentina: ni el servidor (UTC) ni el navegador deciden el día
  return argentinaDate();
}

function parseAnchor(anchor: string): moment.Moment {
  const parsed = moment(anchor, PERIOD_ANCHOR_FORMAT, true);
  return parsed.isValid() ? parsed : moment(argentinaDate(), PERIOD_ANCHOR_FORMAT);
}

/**
 * Resuelve el rango semiabierto [start, end) del período que contiene al ancla.
 * Semiabierto para poder usarlo tal cual en un `where` de Prisma (`gte` / `lt`)
 * sin preocuparse por el último milisegundo del día.
 */
export function resolvePeriodRange(
  granularity: PeriodGranularity,
  anchor: string
): { start: moment.Moment; end: moment.Moment } {
  const start = parseAnchor(anchor).startOf(granularity);
  return { start, end: start.clone().add(1, granularity) };
}

/**
 * Mismo rango semiabierto pero como INSTANTES, para cortar columnas `timestamptz`
 * (`created_at`, `completed_at`): las 00:00 hora argentina del primer y del último día.
 * `resolvePeriodRange` sigue devolviendo fechas calendario (para `@db.Date` y etiquetas).
 */
export function resolvePeriodInstants(granularity: PeriodGranularity, anchor: string): { start: Date; end: Date } {
  const { start, end } = resolvePeriodRange(granularity, anchor);
  return {
    start: argentinaDayStart(start.format(PERIOD_ANCHOR_FORMAT)),
    end: argentinaDayStart(end.format(PERIOD_ANCHOR_FORMAT)),
  };
}

/** Mueve el ancla `delta` períodos (negativo = atrás) manteniendo la granularidad. */
export function shiftAnchor(granularity: PeriodGranularity, anchor: string, delta: number): string {
  return parseAnchor(anchor).startOf(granularity).add(delta, granularity).format(PERIOD_ANCHOR_FORMAT);
}

/** `true` si el período siguiente al del ancla todavía no empezó. */
export function isLastNavigablePeriod(granularity: PeriodGranularity, anchor: string): boolean {
  const { end } = resolvePeriodRange(granularity, anchor);
  return !end.isSameOrBefore(moment(argentinaDate(), PERIOD_ANCHOR_FORMAT), 'day');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Mes abreviado sin el punto que agrega el locale español ("sep." → "Sep"). */
function shortMonth(m: moment.Moment): string {
  return capitalize(m.clone().locale('es').format('MMM').replace('.', ''));
}

/**
 * Etiqueta compacta para el navegador de períodos: ancho estable y sin repetir
 * palabra por palabra el subtítulo de la tarjeta, que lleva la versión larga.
 */
export function formatPeriodLabelShort(granularity: PeriodGranularity, anchor: string): string {
  const { start } = resolvePeriodRange(granularity, anchor);

  switch (granularity) {
    case 'day':
      return start.format('DD/MM/YYYY');
    case 'month':
      return `${shortMonth(start)} ${start.format('YYYY')}`;
    case 'quarter':
      return start.clone().locale('es').format('[T]Q YYYY');
    case 'year':
      return start.format('YYYY');
  }
}

/** Etiqueta legible del período — es el subtítulo que ve el usuario. */
export function formatPeriodLabel(granularity: PeriodGranularity, anchor: string): string {
  const { start } = resolvePeriodRange(granularity, anchor);
  const es = start.clone().locale('es');

  switch (granularity) {
    case 'day':
      return capitalize(es.format('dddd D [de] MMMM [de] YYYY'));
    case 'month':
      return capitalize(es.format('MMMM YYYY'));
    case 'quarter':
      return `${es.format('[T]Q YYYY')} · ${shortMonth(start)}–${shortMonth(start.clone().add(2, 'month'))}`;
    case 'year':
      return es.format('YYYY');
  }
}

/** Sustantivo del período, para textos tipo "sin datos en este trimestre". */
export const PERIOD_NOUN: Record<PeriodGranularity, string> = {
  day: 'día',
  month: 'mes',
  quarter: 'trimestre',
  year: 'año',
};
