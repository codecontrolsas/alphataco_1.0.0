import { cn } from '@/lib/utils';
import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';

interface RelativeAgeProps {
  value: Date | string;
  /** Pasado este número de días la antigüedad se marca en rojo. */
  thresholdDays?: number;
  /** Idem en horas (tiene prioridad sobre días cuando el umbral es corto, por ejemplo 48 h). */
  thresholdHours?: number;
  /**
   * `since`: fecha pasada ("hace N días"), que se marca cuando lleva demasiado tiempo.
   * `until`: fecha objetivo ("en N días"), que se marca cuando ya pasó.
   */
  unit?: 'since' | 'until';
}

const MS_PER_DAY = 86_400_000;

function dayNumber(date: Date): number {
  return Date.parse(`${argentinaDate(date)}T00:00:00Z`) / MS_PER_DAY;
}

function plural(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

/**
 * Fecha (DD/MM/YYYY, hora argentina) con su distancia a hoy. Pasado el umbral se pone en rojo y se
 * agrega un texto para lectores de pantalla: el color solo no alcanza.
 */
export function RelativeAge({ value, thresholdDays, thresholdHours, unit = 'since' }: RelativeAgeProps) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="text-muted-foreground">—</span>;

  const now = new Date();
  // Días por calendario argentino: positivo = ya pasó, negativo = falta.
  const daysPast = dayNumber(now) - dayNumber(date);
  const hoursPast = (now.getTime() - date.getTime()) / 3_600_000;

  let relative: string;
  if (daysPast === 0) relative = 'hoy';
  else if (daysPast > 0) relative = `hace ${plural(daysPast)}`;
  else relative = `en ${plural(-daysPast)}`;

  const overdue =
    unit === 'until'
      ? daysPast > (thresholdDays ?? 0)
      : (thresholdHours != null && hoursPast > thresholdHours) ||
        (thresholdDays != null && daysPast > thresholdDays);

  return (
    <span className="block leading-tight" suppressHydrationWarning>
      <time dateTime={date.toISOString()}>{formatArgentinaDay(date)}</time>
      <span
        className={cn(
          'block text-[12.5px]',
          overdue ? 'text-danger-subtle-foreground font-semibold' : 'text-muted-foreground'
        )}
      >
        {relative}
        {overdue ? <span className="sr-only"> (fuera de plazo)</span> : null}
      </span>
    </span>
  );
}
