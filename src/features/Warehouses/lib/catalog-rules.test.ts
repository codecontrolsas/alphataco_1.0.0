import { describe, expect, it } from 'vitest';
import {
  materialRemovalMode,
  referencedRemovalMode,
  trackingTypeChangeError,
  unitChangeError,
  warehouseRemoval,
} from './catalog-rules';

describe('reglas de catalogo', () => {
  it('un material con movimientos se desactiva, sin movimientos se borra', () => {
    expect(materialRemovalMode(0)).toBe('delete');
    expect(materialRemovalMode(3)).toBe('deactivate');
  });

  it('el tipo de control solo cambia mientras no haya movimientos', () => {
    expect(trackingTypeChangeError(0, true)).toBeNull();
    expect(trackingTypeChangeError(5, false)).toBeNull();
    expect(trackingTypeChangeError(5, true)).toMatch(/ya tiene movimientos/);
  });

  it('la unidad de medida solo cambia mientras no haya movimientos', () => {
    expect(unitChangeError(0, true)).toBeNull();
    expect(unitChangeError(2, true)).toMatch(/unidad de medida/);
  });

  it('un deposito con stock no se da de baja', () => {
    expect(warehouseRemoval(2, 10)).toEqual({ error: expect.stringMatching(/tiene stock/) });
    expect(warehouseRemoval(0, 10)).toEqual({ mode: 'deactivate' });
    expect(warehouseRemoval(0, 0)).toEqual({ mode: 'delete' });
  });

  it('categorias y unidades en uso se desactivan', () => {
    expect(referencedRemovalMode(1)).toBe('deactivate');
    expect(referencedRemovalMode(0)).toBe('delete');
  });
});
