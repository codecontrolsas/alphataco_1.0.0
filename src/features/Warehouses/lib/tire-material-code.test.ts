import { describe, expect, it } from 'vitest';
import { tireMaterialBaseCode, tireMaterialCode, tireMaterialName } from './tire-material-code';

describe('tireMaterialCode', () => {
  it('arma medida, dibujo y marca', () => {
    expect(tireMaterialBaseCode({ size: '295/80 R22.5', treadType: 'MIXED', brandName: 'Firestone' })).toBe(
      'CUB-295/80R22.5-MIX-FIR'
    );
    expect(tireMaterialBaseCode({ size: '11r22.5', treadType: 'BLOCK', brandName: 'Bridgestone' })).toBe(
      'CUB-11R22.5-TAC-BRI'
    );
    expect(tireMaterialBaseCode({ size: '215/75R17.5', treadType: 'SMOOTH', brandName: 'Pírelli' })).toBe(
      'CUB-215/75R17.5-LIS-PIR'
    );
  });

  it('usa valores por defecto si la medida o la marca quedan vacías', () => {
    expect(tireMaterialBaseCode({ size: '  ', treadType: 'MIXED', brandName: '--' })).toBe('CUB-S-MIX-SM');
  });

  it('agrega sufijo ante colisión', () => {
    const c = { size: '295/80R22.5', treadType: 'MIXED' as const, brandName: 'Firestone' };
    expect(tireMaterialCode(c, new Set())).toBe('CUB-295/80R22.5-MIX-FIR');
    expect(tireMaterialCode(c, new Set(['CUB-295/80R22.5-MIX-FIR', 'CUB-295/80R22.5-MIX-FIR-2']))).toBe(
      'CUB-295/80R22.5-MIX-FIR-3'
    );
  });

  it('nombre legible', () => {
    expect(tireMaterialName({ size: '295/80R22.5', treadType: 'MIXED', brandName: ' Firestone ' })).toBe(
      'Cubierta 295/80R22.5 Mixto · Firestone'
    );
  });
});
