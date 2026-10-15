import { AlertCircle, Ban, CheckCheck, CheckCircle2, CircleDashed, CircleX, Clock, FilePen, Landmark, Percent, Send, Wallet, XCircle } from 'lucide-react';
import { TONE_TO_BADGE, type StatusUi } from '../../Mantenimiento/lib/status-presentation';
import { MOVEMENT_STATE_LABELS } from '../Movements/MovementsList/constants';
import { TRANSFER_STATE_LABELS } from '../Transfers/TransfersList/constants';
import { BANK_LINE_STATUS_LABELS } from '../schemas/reconciliation';
import { CHECK_STATUS_LABELS, type CheckStatus } from './check-transitions';
import { DEPOSIT_WARNING_LABELS, type DepositWarning } from './checks-dates';
import { OWN_CHECK_ALERT_LABEL, OWN_CHECK_STATUS_LABELS, type OwnCheckAlert, type OwnCheckStatus } from './own-check-transitions';
import { RECEIPT_STATUS_LABELS, RECEIVABLE_STATE_LABELS, type ReceivableState } from './receipt-rules';

/**
 * Fuente única de la presentación de estados de Tesorería (etiqueta, tono e ícono) por entidad.
 *
 * Módulo sin directiva: lo consumen servidor y cliente. Las etiquetas salen de los módulos de reglas
 * de cada entidad (no se redactan acá); acá solo se decide el tono y el ícono. El estado nunca va solo
 * en color: la pastilla lleva ícono y texto.
 */

export { TONE_TO_BADGE };
export type { StatusUi };

/** Cheques de terceros. */
export const CHECK_STATUS_UI: Record<CheckStatus, StatusUi> = {
  IN_PORTFOLIO: { label: CHECK_STATUS_LABELS.IN_PORTFOLIO, tone: 'info', icon: Wallet },
  DEPOSITED: { label: CHECK_STATUS_LABELS.DEPOSITED, tone: 'pending', icon: Landmark },
  ENDORSED: { label: CHECK_STATUS_LABELS.ENDORSED, tone: 'neutral', icon: Send },
  DISCOUNTED: { label: CHECK_STATUS_LABELS.DISCOUNTED, tone: 'neutral', icon: Percent },
  REJECTED: { label: CHECK_STATUS_LABELS.REJECTED, tone: 'danger', icon: XCircle },
  CANCELLED: { label: CHECK_STATUS_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
};

/** Aviso de depósito de un cheque en cartera (`OK` no muestra nada). */
export const DEPOSIT_WARNING_UI: Record<Exclude<DepositWarning, 'OK'>, StatusUi> = {
  DUE_SOON: { label: DEPOSIT_WARNING_LABELS.DUE_SOON, tone: 'warn', icon: Clock },
  EXPIRED: { label: DEPOSIT_WARNING_LABELS.EXPIRED, tone: 'danger', icon: AlertCircle },
};

/** Cheques propios. */
export const OWN_CHECK_STATUS_UI: Record<OwnCheckStatus, StatusUi> = {
  ISSUED: { label: OWN_CHECK_STATUS_LABELS.ISSUED, tone: 'info', icon: Send },
  DEBITED: { label: OWN_CHECK_STATUS_LABELS.DEBITED, tone: 'ok', icon: CheckCircle2 },
  REJECTED: { label: OWN_CHECK_STATUS_LABELS.REJECTED, tone: 'danger', icon: XCircle },
  CANCELLED: { label: OWN_CHECK_STATUS_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
};

/** Aviso de un cheque propio emitido cuya fecha de pago ya pasó. */
export const OWN_CHECK_ALERT_UI: Record<OwnCheckAlert, StatusUi> = {
  PENDING_CONFIRMATION: { label: OWN_CHECK_ALERT_LABEL, tone: 'warn', icon: Clock },
};

/** Recibos de cobranza. */
export const RECEIPT_STATUS_UI: Record<keyof typeof RECEIPT_STATUS_LABELS, StatusUi> = {
  DRAFT: { label: RECEIPT_STATUS_LABELS.DRAFT, tone: 'neutral', icon: FilePen },
  CONFIRMED: { label: RECEIPT_STATUS_LABELS.CONFIRMED, tone: 'ok', icon: CheckCircle2 },
  CANCELLED: { label: RECEIPT_STATUS_LABELS.CANCELLED, tone: 'danger', icon: Ban },
};

/** Movimientos de tesorería: vigente, anulado, y "conciliado" como marca extra de un vigente. */
export const MOVEMENT_STATE_UI: Record<keyof typeof MOVEMENT_STATE_LABELS, StatusUi> = {
  ACTIVE: { label: MOVEMENT_STATE_LABELS.ACTIVE, tone: 'ok', icon: CheckCircle2 },
  CANCELLED: { label: MOVEMENT_STATE_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
  RECONCILED: { label: MOVEMENT_STATE_LABELS.RECONCILED, tone: 'info', icon: CheckCheck },
};

/** Transferencias entre cuentas: vigente o anulada. */
export const TRANSFER_STATE_UI: Record<keyof typeof TRANSFER_STATE_LABELS, StatusUi> = {
  ACTIVE: { label: TRANSFER_STATE_LABELS.ACTIVE, tone: 'ok', icon: CheckCircle2 },
  CANCELLED: { label: TRANSFER_STATE_LABELS.CANCELLED, tone: 'neutral', icon: Ban },
};

/** Líneas del extracto bancario. */
export const BANK_LINE_STATUS_UI: Record<keyof typeof BANK_LINE_STATUS_LABELS, StatusUi> = {
  PENDING: { label: BANK_LINE_STATUS_LABELS.PENDING, tone: 'warn', icon: Clock },
  MATCHED: { label: BANK_LINE_STATUS_LABELS.MATCHED, tone: 'ok', icon: CheckCheck },
  CREATED: { label: BANK_LINE_STATUS_LABELS.CREATED, tone: 'info', icon: CheckCircle2 },
  IGNORED: { label: BANK_LINE_STATUS_LABELS.IGNORED, tone: 'neutral', icon: CircleX },
};

/** Vencimiento de lo que hay por cobrar. */
export const RECEIVABLE_STATE_UI: Record<ReceivableState, StatusUi> = {
  OVERDUE: { label: RECEIVABLE_STATE_LABELS.OVERDUE, tone: 'danger', icon: AlertCircle },
  DUE: { label: RECEIVABLE_STATE_LABELS.DUE, tone: 'info', icon: Clock },
  IN_DRAFT: { label: RECEIVABLE_STATE_LABELS.IN_DRAFT, tone: 'pending', icon: CircleDashed },
};
