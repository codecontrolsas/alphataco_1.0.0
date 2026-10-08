import { describe, expect, it } from 'vitest';
import { averageCostAfterEntry, averageCostAfterEntryReversal, lineTotal } from './average-cost';

describe('averageCostAfterEntry', () => {
  it('sin stock previo, el promedio es el costo de la entrada', () => {
    expect(averageCostAfterEntry('0', '0', '10', '150').toFixed(4)).toBe('150.0000');
  });

  it('con stock negativo o cero tampoco promedia con el costo viejo', () => {
    expect(averageCostAfterEntry('0', '999', '5', '20').toFixed(4)).toBe('20.0000');
  });

  it('pondera por cantidad', () => {
    // 10 a 100 + 30 a 200 = 7000 / 40 = 175
    expect(averageCostAfterEntry('10', '100', '30', '200').toFixed(4)).toBe('175.0000');
  });

  it('entradas sucesivas encadenan el promedio', () => {
    const first = averageCostAfterEntry('0', '0', '3', '10');
    const second = averageCostAfterEntry('3', first, '1', '14');
    // (3×10 + 1×14) / 4 = 11
    expect(second.toFixed(4)).toBe('11.0000');
  });

  it('redondea a 4 decimales medio hacia arriba', () => {
    // (1×1 + 2×2) / 3 = 1.66666… → 1.6667
    expect(averageCostAfterEntry('1', '1', '2', '2').toFixed(4)).toBe('1.6667');
  });

  it('una entrada a costo 0 baja el promedio', () => {
    expect(averageCostAfterEntry('10', '100', '10', '0').toFixed(4)).toBe('50.0000');
  });
});

describe('averageCostAfterEntryReversal', () => {
  it('deshace exactamente la entrada que se anula', () => {
    const avg = averageCostAfterEntry('10', '100', '30', '200'); // 175
    expect(averageCostAfterEntryReversal('40', avg, '30', '200').toFixed(4)).toBe('100.0000');
  });

  it('si no queda stock, conserva el ultimo promedio', () => {
    expect(averageCostAfterEntryReversal('5', '80', '5', '80').toFixed(4)).toBe('80.0000');
  });

  it('nunca devuelve un costo negativo', () => {
    // 10 a 1 de promedio, se anula una entrada de 5 a 100: (10 - 500) / 5 < 0
    expect(averageCostAfterEntryReversal('10', '1', '5', '100').toFixed(4)).toBe('0.0000');
  });
});

describe('lineTotal', () => {
  it('multiplica y redondea a 4 decimales', () => {
    expect(lineTotal('3', '1.33335').toFixed(4)).toBe('4.0001');
  });
});
