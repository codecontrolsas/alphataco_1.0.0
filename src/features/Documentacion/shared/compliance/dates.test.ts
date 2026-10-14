import { describe, expect, it } from 'vitest';
import { arCurrentPeriod, arToday, daysUntil, normalizePeriod, parseValidity } from './dates';

describe('arToday / arCurrentPeriod (hora argentina)', () => {
  it('a las 22:30 AR sigue siendo el mismo día aunque UTC ya esté en el siguiente', () => {
    const now = new Date('2026-10-15T01:30:00Z'); // 22:30 del 14/10 en AR
    expect(arToday(now)).toBe('2026-10-14');
    expect(arCurrentPeriod(now)).toBe('2026-10');
  });

  it('el último día del mes a las 22:30 AR no salta al mes siguiente', () => {
    const now = new Date('2026-11-01T01:30:00Z'); // 22:30 del 31/10 en AR
    expect(arToday(now)).toBe('2026-10-31');
    expect(arCurrentPeriod(now)).toBe('2026-10');
  });

  it('después de medianoche AR cambia el día', () => {
    expect(arToday(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-15');
  });
});

describe('normalizePeriod', () => {
  it('acepta YYYY-MM y MM/YYYY', () => {
    expect(normalizePeriod('2026-09')).toBe('2026-09');
    expect(normalizePeriod('09/2026')).toBe('2026-09');
    expect(normalizePeriod(' 9/2026 ')).toBe('2026-09');
  });
  it('rechaza lo que no es un período', () => {
    expect(normalizePeriod(null)).toBeNull();
    expect(normalizePeriod('')).toBeNull();
    expect(normalizePeriod('2026-13')).toBeNull();
    expect(normalizePeriod('13/2026')).toBeNull();
    expect(normalizePeriod('septiembre')).toBeNull();
  });
});

describe('parseValidity', () => {
  it('Date → día en hora argentina', () => {
    expect(parseValidity(new Date('2026-10-15T01:30:00Z'))).toBe('2026-10-14');
  });
  it('texto DD/MM/YYYY (documentos de empresa)', () => {
    expect(parseValidity('05/03/2027')).toBe('2027-03-05');
    expect(parseValidity('5/3/2027')).toBe('2027-03-05');
  });
  it('texto YYYY-MM-DD y valores inválidos', () => {
    expect(parseValidity('2027-03-05')).toBe('2027-03-05');
    expect(parseValidity('31/02/2027')).toBeNull();
    expect(parseValidity('basura')).toBeNull();
    expect(parseValidity(null)).toBeNull();
    expect(parseValidity('')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('cuenta días de calendario', () => {
    expect(daysUntil('2026-10-15', '2026-10-14')).toBe(1);
    expect(daysUntil('2026-10-14', '2026-10-14')).toBe(0);
    expect(daysUntil('2026-10-13', '2026-10-14')).toBe(-1);
    expect(daysUntil('2026-11-13', '2026-10-14')).toBe(30);
  });
});
