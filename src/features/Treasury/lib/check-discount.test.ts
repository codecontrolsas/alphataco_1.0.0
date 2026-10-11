import { describe, expect, it } from 'vitest';
import { discountError, discountNet } from './check-discount';

const B = (value: number) => BigInt(value);

describe('discountNet', () => {
  it('suma los nominales y descuenta intereses y comisión', () => {
    expect(discountNet({ nominals: [B(100000), B(50050)], interest: B(12345), fee: B(1000) })).toEqual({ nominal: B(150050), net: B(136705) });
  });
});

describe('discountError', () => {
  it('neto positivo: sin error', () => expect(discountError(B(1))).toBeNull());
  it('neto 0: error', () => expect(discountError(B(0))).toBe('El neto da $ 0,00: los intereses y la comisión no pueden ser iguales o mayores que el nominal'));
  it('neto negativo: error con el importe', () =>
    expect(discountError(B(-100000))).toBe('El neto da -$ 1.000,00: los intereses y la comisión no pueden ser iguales o mayores que el nominal'));
});
