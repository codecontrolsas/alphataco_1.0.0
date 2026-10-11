import { describe, expect, it } from 'vitest';
import { buildCustomerStatement, type CustomerStatementEntry } from './customer-statement-math';

const entry = (over: Partial<CustomerStatementEntry> & Pick<CustomerStatementEntry, 'id' | 'date'>): CustomerStatementEntry => ({
  currency: 'ARS',
  kind: 'INVOICE',
  label: over.id,
  href: `/x/${over.id}`,
  debit: '0.00',
  credit: '0.00',
  ...over,
});

describe('buildCustomerStatement', () => {
  it('acumula desde el saldo anterior: debe suma, haber resta', () => {
    const [ars] = buildCustomerStatement({ ARS: '1000.00' }, [
      entry({ id: 'b', date: '2026-10-05', kind: 'RECEIPT', credit: '300.00' }),
      entry({ id: 'a', date: '2026-10-01', debit: '500.50' }),
    ]);
    expect(ars.previous).toBe('1000.00');
    expect(ars.rows.map((r) => [r.id, r.balance])).toEqual([
      ['a', '1500.50'],
      ['b', '1200.50'],
    ]);
    expect(ars.closing).toBe('1200.50');
  });

  it('separa las monedas y pone los pesos primero', () => {
    const result = buildCustomerStatement({}, [
      entry({ id: 'u', date: '2026-10-01', currency: 'USD', debit: '100.00' }),
      entry({ id: 'p', date: '2026-10-02', debit: '50.00' }),
    ]);
    expect(result.map((c) => [c.currency, c.closing])).toEqual([
      ['ARS', '50.00'],
      ['USD', '100.00'],
    ]);
  });

  it('una moneda con saldo anterior y sin movimientos aparece igual', () => {
    const result = buildCustomerStatement({ USD: '20.00' }, []);
    expect(result).toEqual([{ currency: 'USD', previous: '20.00', rows: [], closing: '20.00' }]);
  });

  it('un anticipo y su aplicación se compensan', () => {
    const [ars] = buildCustomerStatement({}, [
      entry({ id: 'adv', date: '2026-10-01', kind: 'ADVANCE', credit: '400.00' }),
      entry({ id: 'app', date: '2026-10-03', kind: 'ADVANCE_APPLIED', debit: '400.00' }),
    ]);
    expect(ars.rows.map((r) => r.balance)).toEqual(['-400.00', '0.00']);
  });

  it('a igual fecha ordena por id para que el orden sea estable', () => {
    const [ars] = buildCustomerStatement({}, [
      entry({ id: 'z', date: '2026-10-01', debit: '1.00' }),
      entry({ id: 'm', date: '2026-10-01', debit: '1.00' }),
    ]);
    expect(ars.rows.map((r) => r.id)).toEqual(['m', 'z']);
  });
});
