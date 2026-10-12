import { describe, expect, it } from 'vitest';
import { formatReceiptNumber } from './receipt-number-format';
import { isCollectable, overdueDays, receiptPaymentMovementDate, receivableState } from './receipt-rules';

const B = (value: number) => BigInt(value);

describe('isCollectable', () => {
  it('cobra facturas y notas de débito A, B y C', () => {
    for (const type of [1, 2, 6, 7, 11, 12]) expect(isCollectable(type)).toBe(true);
  });
  it('no cobra notas de crédito ni tipos desconocidos', () => {
    for (const type of [3, 8, 13, 99]) expect(isCollectable(type)).toBe(false);
  });
});

describe('receiptPaymentMovementDate', () => {
  it('transferencia y efectivo entran en la fecha del cobro', () => {
    expect(receiptPaymentMovementDate('TRANSFER', '2026-10-10', null)).toBe('2026-10-10');
    expect(receiptPaymentMovementDate('CASH', '2026-10-10', null)).toBe('2026-10-10');
  });
  it('un cheque (aun a fecha) entra a la cartera en la fecha del cobro (etapa 3a)', () => {
    expect(receiptPaymentMovementDate('ECHECK', '2026-10-10', '2026-11-09')).toBe('2026-10-10');
    expect(receiptPaymentMovementDate('CHECK', '2026-10-10', '2026-10-01')).toBe('2026-10-10');
  });
});

describe('receivableState', () => {
  const today = '2026-10-10';
  it('vencido si el vencimiento ya pasó', () => {
    expect(receivableState({ free: B(100), reserved: B(0), dueDate: '2026-10-09', today })).toBe('OVERDUE');
  });
  it('vence hoy: todavía por vencer', () => {
    expect(receivableState({ free: B(100), reserved: B(0), dueDate: today, today })).toBe('DUE');
  });
  it('sin vencimiento: por vencer', () => {
    expect(receivableState({ free: B(100), reserved: B(0), dueDate: null, today })).toBe('DUE');
  });
  it('en borrador cuando todo lo que queda está reservado', () => {
    expect(receivableState({ free: B(0), reserved: B(100), dueDate: '2026-10-01', today })).toBe('IN_DRAFT');
  });
  it('con una parte libre manda el vencimiento', () => {
    expect(receivableState({ free: B(50), reserved: B(50), dueDate: '2026-10-01', today })).toBe('OVERDUE');
  });
});

describe('overdueDays', () => {
  it('cuenta los días desde el vencimiento, nunca negativos', () => {
    expect(overdueDays('2026-10-01', '2026-10-10')).toBe(9);
    expect(overdueDays('2026-10-20', '2026-10-10')).toBe(0);
    expect(overdueDays(null, '2026-10-10')).toBe(0);
  });
});

describe('formatReceiptNumber', () => {
  it('rellena a 6 dígitos con el prefijo RE', () => {
    expect(formatReceiptNumber(1)).toBe('RE-000001');
    expect(formatReceiptNumber(1234567)).toBe('RE-1234567');
  });
});
