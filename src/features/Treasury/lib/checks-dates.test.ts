import { afterEach, describe, expect, it, vi } from 'vitest';
import { depositDeadline, depositWarning, minCreditDate, rejectionMovementDate } from './checks-dates';
import { treasuryToday } from './today';

describe('depositDeadline', () => {
  it('es la fecha de pago + 30 días', () => {
    expect(depositDeadline('2026-10-11')).toBe('2026-11-10');
  });
  it('cruza el fin de mes y de año', () => {
    expect(depositDeadline('2026-01-31')).toBe('2026-03-02');
    expect(depositDeadline('2026-12-15')).toBe('2027-01-14');
  });
});

describe('depositWarning', () => {
  // Fecha de pago 2026-10-01 → vence para depositar el 2026-10-31.
  const paid = '2026-10-01';
  it('faltan 6 días: OK', () => expect(depositWarning(paid, '2026-10-25')).toBe('OK'));
  it('faltan 5 días: por vencer', () => expect(depositWarning(paid, '2026-10-26')).toBe('DUE_SOON'));
  it('vence hoy: por vencer', () => expect(depositWarning(paid, '2026-10-31')).toBe('DUE_SOON'));
  it('pasó un día: vencido', () => expect(depositWarning(paid, '2026-11-01')).toBe('EXPIRED'));
});

describe('minCreditDate', () => {
  it('es la mayor entre el depósito y la fecha de pago', () => {
    expect(minCreditDate('2026-10-11', '2026-10-20')).toBe('2026-10-20');
    expect(minCreditDate('2026-10-11', '2026-10-01')).toBe('2026-10-11');
  });
});

describe('rejectionMovementDate', () => {
  it('con acreditación futura, sale el día de la acreditación', () => {
    expect(rejectionMovementDate('2026-10-11', '2026-10-15')).toBe('2026-10-15');
  });
  it('con acreditación pasada, sale el día del rechazo', () => {
    expect(rejectionMovementDate('2026-10-11', '2026-10-05')).toBe('2026-10-11');
  });
  it('sin acreditación (descontado), sale el día del rechazo', () => {
    expect(rejectionMovementDate('2026-10-11', null)).toBe('2026-10-11');
  });
});

describe('aviso con el "hoy" argentino', () => {
  afterEach(() => vi.useRealTimers());
  it('a las 22:30 AR (01:30 UTC del día siguiente) sigue siendo el mismo día', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T01:30:00Z'));
    // En UTC ya es 1/11 (vencido); en Argentina es 31/10 (vence hoy).
    expect(depositWarning('2026-10-01', treasuryToday())).toBe('DUE_SOON');
  });
});
