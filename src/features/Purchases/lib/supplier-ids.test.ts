import { formatCuitText } from '@/shared/utils/cuit-text';
import { describe, expect, it } from 'vitest';
import { isValidCbu, isValidSupplierCuit, normalizeSupplierCuit } from './supplier-ids';

describe('CUIT del proveedor', () => {
  it('normaliza guiones, espacios y puntos', () => {
    expect(normalizeSupplierCuit(' 30-71234567-8 ')).toBe('30712345678');
    expect(normalizeSupplierCuit('30 71234567 8')).toBe('30712345678');
    expect(normalizeSupplierCuit('30.71234567.8')).toBe('30712345678');
  });

  it('valida el digito verificador con cualquier formato', () => {
    // 20-12345678-6 es un CUIT valido de ejemplo (verificador 6).
    expect(isValidSupplierCuit('20123456786')).toBe(true);
    expect(isValidSupplierCuit('20-12345678-6')).toBe(true);
    expect(isValidSupplierCuit('20-12345678-5')).toBe(false);
    expect(isValidSupplierCuit('2012345678')).toBe(false);
  });

  it('formatea con guiones', () => {
    expect(formatCuitText(BigInt('20123456786'))).toBe('20-12345678-6');
    expect(formatCuitText('123')).toBe('123');
  });
});

describe('CBU', () => {
  it('acepta un CBU con los dos verificadores correctos', () => {
    expect(isValidCbu('2850590940090418135201')).toBe(true);
    expect(isValidCbu('2850590-940090418135201')).toBe(true);
  });

  it('rechaza verificadores incorrectos y largos invalidos', () => {
    expect(isValidCbu('2850591940090418135201')).toBe(false); // primer bloque
    expect(isValidCbu('2850590940090418135202')).toBe(false); // segundo bloque
    expect(isValidCbu('285059094009041813520')).toBe(false); // 21 digitos
  });
});
