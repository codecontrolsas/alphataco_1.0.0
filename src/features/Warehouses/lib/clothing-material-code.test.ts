import { describe, expect, it } from 'vitest';
import { clothingMaterialBaseCode, clothingMaterialCode, clothingMaterialName } from './clothing-material-code';

const camisa = { itemCode: 'IND-001', itemName: 'Camisa de trabajo', brandName: 'Ombú', sizeName: '42' };

describe('clothingMaterialBaseCode', () => {
  it('usa el codigo del articulo, 3 letras de la marca sin acentos y el talle', () => {
    expect(clothingMaterialBaseCode(camisa)).toBe('IND-001-OMB-42');
  });

  it('sin codigo de articulo usa las primeras 6 letras del nombre', () => {
    expect(clothingMaterialBaseCode({ ...camisa, itemCode: null })).toBe('CAMISA-OMB-42');
    expect(clothingMaterialBaseCode({ ...camisa, itemCode: '  ' })).toBe('CAMISA-OMB-42');
  });

  it('limpia espacios, acentos y simbolos de todas las partes', () => {
    expect(
      clothingMaterialBaseCode({ itemCode: 'epp 004', itemName: 'x', brandName: '3M Argentina', sizeName: 'Talle Único' })
    ).toBe('EPP004-3MA-TALLEUNICO');
  });

  it('nunca deja una parte vacia', () => {
    expect(clothingMaterialBaseCode({ itemCode: null, itemName: '¿?', brandName: '--', sizeName: '' })).toBe('ROPA-SM-U');
  });
});

describe('clothingMaterialCode', () => {
  it('suma sufijo si el codigo ya esta tomado', () => {
    expect(clothingMaterialCode(camisa, new Set())).toBe('IND-001-OMB-42');
    expect(clothingMaterialCode(camisa, new Set(['IND-001-OMB-42']))).toBe('IND-001-OMB-42-2');
    expect(clothingMaterialCode(camisa, new Set(['IND-001-OMB-42', 'IND-001-OMB-42-2']))).toBe('IND-001-OMB-42-3');
  });

  it('dos marcas con la misma abreviatura no chocan', () => {
    const taken = new Set([clothingMaterialCode({ ...camisa, brandName: 'Ombú' }, new Set())]);
    expect(clothingMaterialCode({ ...camisa, brandName: 'Ombudsman' }, taken)).toBe('IND-001-OMB-42-2');
  });
});

describe('clothingMaterialName', () => {
  it('une articulo, marca y talle', () => {
    expect(clothingMaterialName(camisa)).toBe('Camisa de trabajo · Ombú · 42');
  });
});
