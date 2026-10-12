import { describe, expect, it } from 'vitest';
import { formatTransferNumber } from './transfer-number-format';

describe('formatTransferNumber', () => {
  it('rellena a 6 dígitos con el prefijo TR', () => {
    expect(formatTransferNumber(1)).toBe('TR-000001');
    expect(formatTransferNumber(1234567)).toBe('TR-1234567');
  });
});
