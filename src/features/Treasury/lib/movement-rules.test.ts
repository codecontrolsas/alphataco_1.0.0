import { describe, expect, it } from 'vitest';
import { conceptAllows, isFuture, paymentMovementDate, signedCents } from './movement-rules';

describe('signedCents', () => {
  it('un ingreso es positivo', () => {
    expect(signedCents('IN', '1234,50')).toBe(BigInt(123450));
  });
  it('un egreso es negativo', () => {
    expect(signedCents('OUT', '1.234,50')).toBe(BigInt(-123450));
  });
  it('rechaza importes no positivos o mal escritos', () => {
    expect(() => signedCents('IN', '0')).toThrow();
    expect(() => signedCents('IN', '-5')).toThrow();
    expect(() => signedCents('IN', 'abc')).toThrow();
  });
});

describe('conceptAllows', () => {
  it('BOTH admite los dos sentidos', () => {
    expect(conceptAllows('BOTH', 'IN')).toBe(true);
    expect(conceptAllows('BOTH', 'OUT')).toBe(true);
  });
  it('un concepto de egreso no admite ingresos', () => {
    expect(conceptAllows('OUT', 'IN')).toBe(false);
    expect(conceptAllows('OUT', 'OUT')).toBe(true);
    expect(conceptAllows('IN', 'OUT')).toBe(false);
  });
});

describe('paymentMovementDate', () => {
  it('un cheque o e-cheq sale en su fecha de pago', () => {
    expect(paymentMovementDate('ECHECK', '2026-10-10', '2026-11-15')).toBe('2026-11-15');
    expect(paymentMovementDate('CHECK', '2026-10-10', '2026-10-20')).toBe('2026-10-20');
  });
  it('una transferencia o efectivo sale en la fecha de pago de la orden', () => {
    expect(paymentMovementDate('TRANSFER', '2026-10-10', null)).toBe('2026-10-10');
    expect(paymentMovementDate('CASH', '2026-10-10', '2026-11-15')).toBe('2026-10-10');
  });
  it('un cheque sin fecha es un error', () => {
    expect(() => paymentMovementDate('CHECK', '2026-10-10', null)).toThrow();
  });
});

describe('isFuture', () => {
  it('la fecha de hoy no es futura (entra al saldo)', () => {
    expect(isFuture('2026-10-10', '2026-10-10')).toBe(false);
  });
  it('mañana es futuro y ayer no', () => {
    expect(isFuture('2026-10-11', '2026-10-10')).toBe(true);
    expect(isFuture('2026-10-09', '2026-10-10')).toBe(false);
  });
});
