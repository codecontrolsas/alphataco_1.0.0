/**
 * Estados de un cheque propio y sus transiciones (spec Tesorería etapa 3b §3.1). Módulo SIN
 * directiva. `lib/own-checks.ts` es el único que cambia el estado, y lo hace siempre a través de esto.
 */

export type OwnCheckStatus = 'ISSUED' | 'DEBITED' | 'REJECTED' | 'CANCELLED';

/**
 * DEBIT: el banco lo debitó (lo confirma un usuario). UNDO_DEBIT: se marcó por error. REJECT: el
 * banco lo rechazó. UNDO_REJECTION: se anula el rechazo. CANCEL: se anula la orden de pago que lo emitió.
 */
export type OwnCheckAction = 'DEBIT' | 'UNDO_DEBIT' | 'REJECT' | 'UNDO_REJECTION' | 'CANCEL';

/** Estado resultante, o null si la transición no está permitida. */
export function nextOwnCheckStatus(from: OwnCheckStatus, action: OwnCheckAction): OwnCheckStatus | null {
  switch (action) {
    case 'DEBIT':
      return from === 'ISSUED' ? 'DEBITED' : null;
    case 'UNDO_DEBIT':
      return from === 'DEBITED' ? 'ISSUED' : null;
    case 'REJECT':
      return from === 'ISSUED' ? 'REJECTED' : null;
    case 'UNDO_REJECTION':
      return from === 'REJECTED' ? 'ISSUED' : null;
    case 'CANCEL':
      return from === 'ISSUED' ? 'CANCELLED' : null;
  }
}

export const OWN_CHECK_STATUS_LABELS: Record<OwnCheckStatus, string> = {
  ISSUED: 'Emitido',
  DEBITED: 'Debitado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Anulado',
};

export const OWN_CHECK_KIND_LABELS: Record<'PHYSICAL' | 'ECHECK', string> = {
  PHYSICAL: 'Cheque',
  ECHECK: 'E-cheq',
};

const ACTION_VERBS: Record<OwnCheckAction, string> = {
  DEBIT: 'confirmar el débito',
  UNDO_DEBIT: 'deshacer el débito',
  REJECT: 'registrar el rechazo',
  UNDO_REJECTION: 'anular el rechazo',
  CANCEL: 'anular',
};

/** "El cheque Nº 1234 (Galicia CC) está debitado: no se puede registrar el rechazo". */
export function ownCheckTransitionError(check: { number: string; accountName: string; status: OwnCheckStatus }, action: OwnCheckAction): string {
  return `El cheque Nº ${check.number} (${check.accountName}) está ${OWN_CHECK_STATUS_LABELS[check.status].toLowerCase()}: no se puede ${ACTION_VERBS[action]}`;
}

export type OwnCheckAlert = 'PENDING_CONFIRMATION';

/** Un emitido cuya fecha de pago ya pasó: alguien tiene que mirar el banco y confirmar el débito (o el rechazo). */
export function ownCheckAlert(status: OwnCheckStatus, paymentDate: string | null, today: string): OwnCheckAlert | null {
  return status === 'ISSUED' && paymentDate !== null && paymentDate < today ? 'PENDING_CONFIRMATION' : null;
}

export const OWN_CHECK_ALERT_LABEL = 'Pendiente de confirmar';

/** Número de un cheque físico: entero positivo de hasta 9 dígitos, sin ceros a la izquierda. Null si no es válido. */
export function normalizeCheckNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 ? String(n) : null;
}

export type CheckbookStatus = 'ACTIVE' | 'EXHAUSTED' | 'RETIRED';

export const CHECKBOOK_STATUS_LABELS: Record<CheckbookStatus, string> = {
  ACTIVE: 'Activa',
  EXHAUSTED: 'Agotada',
  RETIRED: 'Dada de baja',
};

/** Estado de la chequera: se calcula, no se guarda. */
export function checkbookStatus(input: { retired: boolean; free: number }): CheckbookStatus {
  if (input.retired) return 'RETIRED';
  return input.free === 0 ? 'EXHAUSTED' : 'ACTIVE';
}

/** Máximo de números por chequera (lo garantiza también el CHECK de la tabla). */
export const MAX_CHECKBOOK_SIZE = 500;
