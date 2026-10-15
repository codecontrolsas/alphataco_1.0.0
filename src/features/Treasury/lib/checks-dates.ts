import moment from 'moment';

/**
 * Fechas de los cheques de terceros (spec Tesorería etapa 3a §3.3, §3.6 y §3.8). Módulo SIN
 * directiva: lo usan la tabla, el detalle y las actions. Todas las fechas son `YYYY-MM-DD` de
 * Argentina; la aritmética es de fecha pura (`moment.utc`), sin zona horaria de por medio.
 */

/** Plazo para presentar un cheque al banco, contado desde su fecha de pago. */
export const DEPOSIT_WINDOW_DAYS = 30;
/** Días antes del vencimiento en que se avisa "Por vencer". */
export const DUE_SOON_DAYS = 5;

const day = (value: string) => moment.utc(value, 'YYYY-MM-DD', true);

/** Último día para presentar el cheque al banco: fecha de pago + 30 días. */
export function depositDeadline(paymentDate: string): string {
  return day(paymentDate).add(DEPOSIT_WINDOW_DAYS, 'days').format('YYYY-MM-DD');
}

export type DepositWarning = 'OK' | 'DUE_SOON' | 'EXPIRED';

/** Aviso de un cheque EN CARTERA contra `today` (de `treasuryToday()`). Solo avisa: no bloquea nada. */
export function depositWarning(paymentDate: string, today: string): DepositWarning {
  const deadline = depositDeadline(paymentDate);
  if (today > deadline) return 'EXPIRED';
  return day(deadline).diff(day(today), 'days') <= DUE_SOON_DAYS ? 'DUE_SOON' : 'OK';
}

/**
 * Los mismos avisos de `depositWarning`, pero como corte sobre la fecha de pago para filtrar en SQL:
 * VENCIDO si `payment_date < expiredBefore`; POR VENCER (o ya vencido) si `payment_date <= warnUntil`.
 */
export function depositWarningCutoffs(today: string): { expiredBefore: string; warnUntil: string } {
  return {
    expiredBefore: day(today).subtract(DEPOSIT_WINDOW_DAYS, 'days').format('YYYY-MM-DD'),
    warnUntil: day(today).subtract(DEPOSIT_WINDOW_DAYS - DUE_SOON_DAYS, 'days').format('YYYY-MM-DD'),
  };
}

export const DEPOSIT_WARNING_LABELS: Record<DepositWarning, string> = {
  OK: '',
  DUE_SOON: 'Por vencer',
  EXPIRED: 'Vencido para depositar',
};

/** Acreditación mínima de un cheque depositado: la mayor entre el depósito y la fecha de pago. */
export function minCreditDate(depositDate: string, paymentDate: string): string {
  return paymentDate > depositDate ? paymentDate : depositDate;
}

/**
 * Fecha de la salida del banco por el rechazo de un depositado o descontado: la del rechazo, o la
 * de acreditación si todavía no llegó. Así el banco nunca muestra la salida de un cheque antes
 * que su entrada.
 */
export function rejectionMovementDate(rejectionDate: string, creditedOn: string | null): string {
  return creditedOn && creditedOn > rejectionDate ? creditedOn : rejectionDate;
}
