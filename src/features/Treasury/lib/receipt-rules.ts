import moment from 'moment';
import type { PaymentMethodKind } from './movement-rules';

/** Reglas del recibo de cobranza que no dependen de la base (spec Tesorería etapa 2 §3). */

/** Comprobantes que se cobran: facturas y notas de débito A, B y C. */
export const COLLECTABLE_CBTE_TYPES = [1, 2, 6, 7, 11, 12] as const;
/** Notas de crédito A, B y C: bajan el pendiente del comprobante que ajustan. */
export const CREDIT_NOTE_CBTE_TYPES = [3, 8, 13] as const;

export function isCollectable(cbteType: number): boolean {
  return (COLLECTABLE_CBTE_TYPES as readonly number[]).includes(cbteType);
}

/**
 * Fecha valor del movimiento de un medio del recibo: la del cobro; en cheque y e-cheq, su
 * vencimiento si es posterior (queda "a acreditar" hasta esa fecha).
 */
export function receiptPaymentMovementDate(method: PaymentMethodKind, receiptDate: string, checkDueOn: string | null): string {
  if (method === 'CHECK' || method === 'ECHECK') {
    if (!checkDueOn) throw new Error('El cheque no tiene vencimiento');
    return checkDueOn > receiptDate ? checkDueOn : receiptDate;
  }
  return receiptDate;
}

export type ReceivableState = 'OVERDUE' | 'DUE' | 'IN_DRAFT';

/**
 * Estado de un comprobante en "A cobrar": en borrador si todo lo que queda está reservado por un
 * recibo en borrador; si no, vencido o por vencer contra `today` (vence hoy = todavía por vencer).
 */
export function receivableState(input: { free: bigint; reserved: bigint; dueDate: string | null; today: string }): ReceivableState {
  if (input.free <= BigInt(0) && input.reserved > BigInt(0)) return 'IN_DRAFT';
  if (input.dueDate && input.dueDate < input.today) return 'OVERDUE';
  return 'DUE';
}

/** Días de atraso desde el vencimiento (0 si no venció o no tiene). */
export function overdueDays(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  return Math.max(0, moment(today, 'YYYY-MM-DD').diff(moment(dueDate, 'YYYY-MM-DD'), 'days'));
}

export const RECEIPT_STATUS_LABELS: Record<'DRAFT' | 'CONFIRMED' | 'CANCELLED', string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Anulado',
};

export const RECEIVABLE_STATE_LABELS: Record<ReceivableState, string> = {
  OVERDUE: 'Vencido',
  DUE: 'Por vencer',
  IN_DRAFT: 'En borrador',
};
