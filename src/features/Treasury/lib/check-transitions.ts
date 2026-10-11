/**
 * Estados de un cheque de tercero y sus transiciones (spec Tesorería etapa 3a §3.1). Módulo SIN
 * directiva. `lib/checks.ts` es el único que cambia el estado, y lo hace siempre a través de esto.
 */

export type CheckStatus = 'IN_PORTFOLIO' | 'DEPOSITED' | 'ENDORSED' | 'DISCOUNTED' | 'REJECTED' | 'CANCELLED';

/**
 * DEPOSIT / ENDORSE / DISCOUNT: sale de la cartera. REJECT: lo devuelve el banco o el proveedor.
 * CANCEL_ORIGIN: se anula el recibo o la carga inicial que lo trajo. UNDO_EXIT: se anula la
 * operación que lo sacó (vuelve a la cartera). UNDO_REJECTION: se anula el rechazo.
 */
export type CheckAction = 'DEPOSIT' | 'ENDORSE' | 'DISCOUNT' | 'REJECT' | 'CANCEL_ORIGIN' | 'UNDO_EXIT' | 'UNDO_REJECTION';

const OUT_OF_PORTFOLIO: readonly CheckStatus[] = ['DEPOSITED', 'ENDORSED', 'DISCOUNTED'];

/** Estado resultante, o null si la transición no está permitida. */
export function nextCheckStatus(from: CheckStatus, action: CheckAction, rejectedFrom?: CheckStatus | null): CheckStatus | null {
  switch (action) {
    case 'DEPOSIT':
      return from === 'IN_PORTFOLIO' ? 'DEPOSITED' : null;
    case 'ENDORSE':
      return from === 'IN_PORTFOLIO' ? 'ENDORSED' : null;
    case 'DISCOUNT':
      return from === 'IN_PORTFOLIO' ? 'DISCOUNTED' : null;
    case 'REJECT':
      return OUT_OF_PORTFOLIO.includes(from) ? 'REJECTED' : null;
    case 'CANCEL_ORIGIN':
      return from === 'IN_PORTFOLIO' ? 'CANCELLED' : null;
    case 'UNDO_EXIT':
      return OUT_OF_PORTFOLIO.includes(from) ? 'IN_PORTFOLIO' : null;
    case 'UNDO_REJECTION':
      return from === 'REJECTED' && rejectedFrom && OUT_OF_PORTFOLIO.includes(rejectedFrom) ? rejectedFrom : null;
  }
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  IN_PORTFOLIO: 'En cartera',
  DEPOSITED: 'Depositado',
  ENDORSED: 'Endosado',
  DISCOUNTED: 'Descontado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Anulado',
};

export const CHECK_KIND_LABELS: Record<'PHYSICAL' | 'ECHECK', string> = {
  PHYSICAL: 'Cheque',
  ECHECK: 'E-cheq',
};

const ACTION_VERBS: Record<CheckAction, string> = {
  DEPOSIT: 'depositar',
  ENDORSE: 'endosar',
  DISCOUNT: 'descontar',
  REJECT: 'rechazar',
  CANCEL_ORIGIN: 'anular',
  UNDO_EXIT: 'devolver a la cartera',
  UNDO_REJECTION: 'deshacer el rechazo',
};

/** "El cheque Nº 123 (BANCO GALICIA) está depositado: no se puede endosar". */
export function transitionError(check: { number: string; bank: string; status: CheckStatus }, action: CheckAction): string {
  return `El cheque Nº ${check.number} (${check.bank}) está ${CHECK_STATUS_LABELS[check.status].toLowerCase()}: no se puede ${ACTION_VERBS[action]}`;
}
