import { describe, expect, it } from 'vitest';
import {
  checkbookStatus,
  nextOwnCheckStatus,
  normalizeCheckNumber,
  ownCheckAlert,
  ownCheckTransitionError,
  type OwnCheckAction,
  type OwnCheckStatus,
} from './own-check-transitions';

const STATUSES: OwnCheckStatus[] = ['ISSUED', 'DEBITED', 'REJECTED', 'CANCELLED'];
const ACTIONS: OwnCheckAction[] = ['DEBIT', 'UNDO_DEBIT', 'REJECT', 'UNDO_REJECTION', 'CANCEL'];

// Spec 3b §3.1: las únicas transiciones válidas.
const VALID: [OwnCheckStatus, OwnCheckAction, OwnCheckStatus][] = [
  ['ISSUED', 'DEBIT', 'DEBITED'],
  ['DEBITED', 'UNDO_DEBIT', 'ISSUED'],
  ['ISSUED', 'REJECT', 'REJECTED'],
  ['REJECTED', 'UNDO_REJECTION', 'ISSUED'],
  ['ISSUED', 'CANCEL', 'CANCELLED'],
];

describe('nextOwnCheckStatus', () => {
  it.each(VALID)('%s + %s → %s', (from, action, to) => {
    expect(nextOwnCheckStatus(from, action)).toBe(to);
  });

  it('el resto de las combinaciones no está permitido', () => {
    for (const from of STATUSES) {
      for (const action of ACTIONS) {
        if (VALID.some(([f, a]) => f === from && a === action)) continue;
        expect(nextOwnCheckStatus(from, action), `${from} + ${action}`).toBeNull();
      }
    }
  });

  it('el mensaje nombra el cheque, su cuenta y su estado', () => {
    expect(ownCheckTransitionError({ number: '1234', accountName: 'Galicia CC', status: 'DEBITED' }, 'REJECT')).toBe(
      'El cheque Nº 1234 (Galicia CC) está debitado: no se puede registrar el rechazo'
    );
  });
});

describe('ownCheckAlert', () => {
  it('un emitido con fecha de pago anterior a hoy está pendiente de confirmar', () => {
    expect(ownCheckAlert('ISSUED', '2026-10-10', '2026-10-11')).toBe('PENDING_CONFIRMATION');
  });
  it('el día de pago todavía no avisa', () => {
    expect(ownCheckAlert('ISSUED', '2026-10-11', '2026-10-11')).toBeNull();
  });
  it('solo avisa en los emitidos', () => {
    expect(ownCheckAlert('DEBITED', '2026-10-01', '2026-10-11')).toBeNull();
    expect(ownCheckAlert('REJECTED', '2026-10-01', '2026-10-11')).toBeNull();
    expect(ownCheckAlert('CANCELLED', null, '2026-10-11')).toBeNull();
  });
});

describe('normalizeCheckNumber', () => {
  it('saca los ceros a la izquierda', () => {
    expect(normalizeCheckNumber('00012345')).toBe('12345');
  });
  it('acepta espacios alrededor', () => {
    expect(normalizeCheckNumber(' 77 ')).toBe('77');
  });
  it('rechaza lo que no es un entero positivo', () => {
    expect(normalizeCheckNumber('12a')).toBeNull();
    expect(normalizeCheckNumber('0')).toBeNull();
    expect(normalizeCheckNumber('')).toBeNull();
    expect(normalizeCheckNumber('1234567890')).toBeNull();
  });
});

describe('checkbookStatus', () => {
  it('dada de baja manda sobre agotada', () => {
    expect(checkbookStatus({ retired: true, free: 0 })).toBe('RETIRED');
  });
  it('sin números libres está agotada', () => {
    expect(checkbookStatus({ retired: false, free: 0 })).toBe('EXHAUSTED');
  });
  it('con números libres está activa', () => {
    expect(checkbookStatus({ retired: false, free: 3 })).toBe('ACTIVE');
  });
});
