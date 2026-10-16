import moment from 'moment';

/**
 * Rangos de fechas de las cargas de diagramas. Módulo puro (sin directiva): lo usan el formulario
 * (cliente) y las server actions, así el tope que ve el usuario es el que se hace cumplir en el servidor.
 */
export interface IsoRange {
  /** `YYYY-MM-DD` */
  from: string;
  /** `YYYY-MM-DD` */
  to: string;
}

const ISO_DAY = 'YYYY-MM-DD';

/** Día calendario (`YYYY-MM-DD`) de una fecha elegida en el calendario del navegador (medianoche local). */
export function dateToIsoDay(date: Date): string {
  return moment(date).format(ISO_DAY);
}

/** `YYYY-MM-DD` → fecha local a medianoche (lo que entiende el calendario). */
export function isoDayToDate(day: string): Date {
  return moment(day, ISO_DAY).toDate();
}

/** Cantidad de días inclusivos del rango; 0 si alguna fecha es inválida o el rango está invertido. */
export function inclusiveDays(range: IsoRange): number {
  const from = moment.utc(range.from, ISO_DAY, true);
  const to = moment.utc(range.to, ISO_DAY, true);
  if (!from.isValid() || !to.isValid() || to.isBefore(from)) return 0;
  return to.diff(from, 'days') + 1;
}

export interface RangesIssue {
  /** Fila con el problema; `null` = problema de la lista entera. */
  index: number | null;
  message: string;
}

/**
 * Primer problema de una lista de rangos, o `null` si es válida: cantidad, fechas reales, desde <= hasta,
 * sin superposición y tope de días entre todos los rangos.
 */
export function findRangesIssue(
  ranges: readonly IsoRange[],
  limits: { maxRanges: number; maxTotalDays: number }
): RangesIssue | null {
  if (ranges.length === 0) return { index: null, message: 'Agregá al menos un rango de fechas' };
  if (ranges.length > limits.maxRanges) {
    return { index: null, message: `Máximo ${limits.maxRanges} rangos por carga` };
  }

  for (const [index, range] of ranges.entries()) {
    const from = moment(range.from, ISO_DAY, true);
    const to = moment(range.to, ISO_DAY, true);
    if (!from.isValid() || !to.isValid()) return { index, message: 'Fecha inválida' };
    if (to.isBefore(from, 'day')) {
      return { index, message: 'La fecha hasta no puede ser anterior a la fecha desde' };
    }
  }

  const sorted = ranges.map((range, index) => ({ ...range, index })).sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < sorted.length; i += 1) {
    // `YYYY-MM-DD` ordena igual como texto que como fecha.
    if (sorted[i].from <= sorted[i - 1].to) {
      return { index: sorted[i].index, message: 'El rango se superpone con otro' };
    }
  }

  const totalDays = ranges.reduce((sum, range) => sum + inclusiveDays(range), 0);
  if (totalDays > limits.maxTotalDays) {
    return { index: null, message: `Máximo ${limits.maxTotalDays} días entre todos los rangos` };
  }
  return null;
}

/** Rangos ordenados de menor a mayor por fecha de inicio. */
export function sortRanges<T extends IsoRange>(ranges: readonly T[]): T[] {
  return [...ranges].sort((a, b) => a.from.localeCompare(b.from));
}

/** Días únicos (`YYYY-MM-DD`) que cubren los rangos, ordenados. Los rangos inválidos se omiten. */
export function expandIsoRanges(ranges: readonly IsoRange[]): string[] {
  const days = new Set<string>();
  for (const range of ranges) {
    if (inclusiveDays(range) === 0) continue;
    const cursor = moment.utc(range.from, ISO_DAY, true);
    const end = moment.utc(range.to, ISO_DAY, true);
    while (cursor.isSameOrBefore(end, 'day')) {
      days.add(cursor.format(ISO_DAY));
      cursor.add(1, 'day');
    }
  }
  return [...days].sort();
}
