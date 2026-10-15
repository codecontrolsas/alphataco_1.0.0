import moment from 'moment';
import { isCalendarDay } from '../schemas/shared';
import { treasuryToday } from './today';

type DateRange = { from: string; to: string };

const month = (at: Date) => moment(treasuryToday(at), 'YYYY-MM-DD');

/** Cuenta corriente del cliente: el mes en curso y los dos anteriores, en hora argentina. */
export function defaultCustomerStatementRange(at: Date = new Date()): DateRange {
  const today = month(at);
  return { from: today.clone().subtract(2, 'months').startOf('month').format('YYYY-MM-DD'), to: today.clone().endOf('month').format('YYYY-MM-DD') };
}

/** Extracto de una cuenta: el mes en curso, en hora argentina. */
export function defaultAccountStatementRange(at: Date = new Date()): DateRange {
  const today = month(at);
  return { from: today.clone().startOf('month').format('YYYY-MM-DD'), to: today.clone().endOf('month').format('YYYY-MM-DD') };
}

/** Tope del período de un extracto de cuenta: no se pagina, así que se acota el rango. */
export const MAX_ACCOUNT_STATEMENT_MONTHS = 12;

/**
 * Por qué un período de extracto no se puede consultar (null si es válido). Aritmética de calendario
 * sobre `YYYY-MM-DD` en UTC: no depende de la zona horaria del equipo ni del servidor.
 */
export function accountStatementRangeError(from: string, to: string): string | null {
  if (!isCalendarDay(from) || !isCalendarDay(to)) return 'Elegí un período válido: ingresá «Desde» y «Hasta» como fechas reales.';
  if (to < from) return 'Elegí un período válido: «Hasta» no puede ser anterior a «Desde».';
  if (moment.utc(to, 'YYYY-MM-DD').isAfter(moment.utc(from, 'YYYY-MM-DD').add(MAX_ACCOUNT_STATEMENT_MONTHS, 'months'))) {
    return `El período no puede superar los ${MAX_ACCOUNT_STATEMENT_MONTHS} meses. Acotá el rango para ver el extracto.`;
  }
  return null;
}
