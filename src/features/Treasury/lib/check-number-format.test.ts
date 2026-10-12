import { describe, expect, it } from 'vitest';
import { formatCheckOperationNumber, normalizeBank } from './check-number-format';

describe('formatCheckOperationNumber', () => {
  it('usa el prefijo del tipo y 6 dígitos', () => {
    expect(formatCheckOperationNumber('DEPOSIT', 1)).toBe('CD-000001');
    expect(formatCheckOperationNumber('DISCOUNT', 12)).toBe('CL-000012');
    expect(formatCheckOperationNumber('REJECTION', 123456)).toBe('CR-123456');
  });
});

describe('normalizeBank', () => {
  it('saca espacios de más y pasa a mayúsculas', () => {
    expect(normalizeBank('  banco   galicia ')).toBe('BANCO GALICIA');
  });
});
