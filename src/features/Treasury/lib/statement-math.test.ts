import { describe, expect, it } from 'vitest';
import { indicatorsFromBuckets, withRunningBalance } from './statement-math';

describe('withRunningBalance', () => {
  it('acumula desde el saldo anterior', () => {
    const { rows, closing } = withRunningBalance('1000.00', [
      { id: 'a', date: '2026-10-01', amount: '-200.50', cancelled: false },
      { id: 'b', date: '2026-10-02', amount: '50.00', cancelled: false },
    ]);
    expect(rows.map((r) => r.balance)).toEqual(['799.50', '849.50']);
    expect(closing).toBe('849.50');
  });
  it('un anulado no suma y lleva el saldo de la fila anterior', () => {
    const { rows, closing } = withRunningBalance('0.00', [
      { id: 'a', date: '2026-10-01', amount: '100.00', cancelled: false },
      { id: 'b', date: '2026-10-02', amount: '-999.00', cancelled: true },
      { id: 'c', date: '2026-10-03', amount: '-30.00', cancelled: false },
    ]);
    expect(rows.map((r) => r.balance)).toEqual(['100.00', '100.00', '70.00']);
    expect(closing).toBe('70.00');
  });
  it('sin filas el saldo final es el anterior', () => {
    expect(withRunningBalance('-15.00', []).closing).toBe('-15.00');
  });
});

describe('indicatorsFromBuckets', () => {
  it('proyectado = saldo + a debitar + a acreditar', () => {
    expect(indicatorsFromBuckets({ balance: '1000.00', toDebit: '-300.00', toCredit: '50.00' })).toEqual({
      balance: '1000.00',
      toDebit: '-300.00',
      toCredit: '50.00',
      projected: '750.00',
    });
  });
});
