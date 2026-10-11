import moment from 'moment';
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
