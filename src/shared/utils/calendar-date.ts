import moment from 'moment';
import 'moment/locale/es';

const EMPTY_DATE = '—';

/**
 * `DD/MM/YYYY` de una fecha de calendario (columna `@db.Date`, que llega como medianoche UTC).
 * Se lee en UTC para que el día no se corra según la zona del navegador o del servidor.
 */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  if (!value) return EMPTY_DATE;
  const parsed = moment.utc(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : EMPTY_DATE;
}

/** Día de la semana en español con la primera letra en mayúscula ("Lunes") de una fecha de calendario. */
export function formatWeekday(value: Date | string | null | undefined): string {
  if (!value) return EMPTY_DATE;
  const parsed = moment.utc(value);
  if (!parsed.isValid()) return EMPTY_DATE;
  const weekday = parsed.locale('es').format('dddd');
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}
