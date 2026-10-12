import { describe, expect, it } from 'vitest';
import { nextCheckStatus, transitionError, type CheckAction, type CheckStatus } from './check-transitions';

const STATUSES: CheckStatus[] = ['IN_PORTFOLIO', 'DEPOSITED', 'ENDORSED', 'DISCOUNTED', 'REJECTED', 'CANCELLED'];
const ACTIONS: CheckAction[] = ['DEPOSIT', 'ENDORSE', 'DISCOUNT', 'REJECT', 'CANCEL_ORIGIN', 'UNDO_EXIT', 'UNDO_REJECTION'];

// Spec §3.1: las únicas transiciones válidas.
const VALID: [CheckStatus, CheckAction, CheckStatus | 'FROM'][] = [
  ['IN_PORTFOLIO', 'DEPOSIT', 'DEPOSITED'],
  ['IN_PORTFOLIO', 'ENDORSE', 'ENDORSED'],
  ['IN_PORTFOLIO', 'DISCOUNT', 'DISCOUNTED'],
  ['DEPOSITED', 'REJECT', 'REJECTED'],
  ['ENDORSED', 'REJECT', 'REJECTED'],
  ['DISCOUNTED', 'REJECT', 'REJECTED'],
  ['IN_PORTFOLIO', 'CANCEL_ORIGIN', 'CANCELLED'],
  ['DEPOSITED', 'UNDO_EXIT', 'IN_PORTFOLIO'],
  ['ENDORSED', 'UNDO_EXIT', 'IN_PORTFOLIO'],
  ['DISCOUNTED', 'UNDO_EXIT', 'IN_PORTFOLIO'],
  ['REJECTED', 'UNDO_REJECTION', 'FROM'],
];

describe('nextCheckStatus', () => {
  it.each(VALID)('%s + %s → %s', (from, action, to) => {
    expect(nextCheckStatus(from, action, 'ENDORSED')).toBe(to === 'FROM' ? 'ENDORSED' : to);
  });

  it('el resto de las combinaciones no está permitido', () => {
    for (const from of STATUSES) {
      for (const action of ACTIONS) {
        if (VALID.some(([f, a]) => f === from && a === action)) continue;
        expect(nextCheckStatus(from, action, 'DEPOSITED'), `${from} + ${action}`).toBeNull();
      }
    }
  });

  it('deshacer un rechazo sin estado anterior no está permitido', () => {
    expect(nextCheckStatus('REJECTED', 'UNDO_REJECTION', null)).toBeNull();
  });
});

describe('transitionError', () => {
  it('nombra el cheque, su estado y lo que no se puede hacer', () => {
    expect(transitionError({ number: '123', bank: 'BANCO GALICIA', status: 'DEPOSITED' }, 'ENDORSE')).toBe(
      'El cheque Nº 123 (BANCO GALICIA) está depositado: no se puede endosar'
    );
  });
  it('en cartera se dice "ya no está en cartera" a quien quiere sacarlo de nuevo', () => {
    expect(transitionError({ number: '9', bank: 'BANCO X', status: 'ENDORSED' }, 'DEPOSIT')).toBe(
      'El cheque Nº 9 (BANCO X) está endosado: no se puede depositar'
    );
  });
});
