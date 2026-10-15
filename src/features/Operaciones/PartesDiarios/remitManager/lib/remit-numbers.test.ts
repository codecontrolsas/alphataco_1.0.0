import { describe, expect, it } from 'vitest';
import { remitNumberContainsWhere, remitNumbersOf } from './remit-numbers';

describe('remitNumbersOf', () => {
  it('devuelve los números en el orden en que vienen', () => {
    expect(remitNumbersOf({ remitos: [{ remit_number: 'R-1' }, { remit_number: 'R-2' }] })).toEqual(['R-1', 'R-2']);
  });

  it('una línea sin remitos devuelve una lista vacía', () => {
    expect(remitNumbersOf({ remitos: [] })).toEqual([]);
    expect(remitNumbersOf({ remitos: null })).toEqual([]);
    expect(remitNumbersOf({})).toEqual([]);
  });

  it('descarta números vacíos', () => {
    expect(remitNumbersOf({ remitos: [{ remit_number: '' }, { remit_number: 'R-3' }] })).toEqual(['R-3']);
  });
});

describe('remitNumberContainsWhere', () => {
  it('busca en cualquiera de los remitos de la línea, sin distinguir mayúsculas y sin espacios de más', () => {
    expect(remitNumberContainsWhere('  r-00 ')).toEqual({
      remitos: { some: { remit_number: { contains: 'r-00', mode: 'insensitive' } } },
    });
  });
});
