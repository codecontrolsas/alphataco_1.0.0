import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { describe, expect, it } from 'vitest';
import { treasuryToday } from './today';

describe('treasuryToday', () => {
  it('a las 22:30 de Argentina (01:30 UTC del día siguiente) sigue siendo hoy en Argentina', () => {
    expect(treasuryToday(new Date('2026-10-11T01:30:00.000Z'))).toBe('2026-10-10');
  });
  it('a las 00:30 de Argentina ya es el día siguiente', () => {
    expect(treasuryToday(new Date('2026-10-11T03:30:00.000Z'))).toBe('2026-10-11');
  });
});

describe('fecha y hora en Argentina', () => {
  // 01:30 UTC del 11/10 = 22:30 del 10/10 en Argentina.
  const LATE = '2026-10-11T01:30:00.000Z';
  it('formatea fecha y hora en hora argentina, sin importar la zona del proceso', () => {
    expect(formatArgentinaDateTime(LATE)).toBe('10/10/2026 22:30');
  });
  it('el día de un timestamp es el de Argentina', () => {
    expect(formatArgentinaDay(new Date(LATE))).toBe('10/10/2026');
  });
});
