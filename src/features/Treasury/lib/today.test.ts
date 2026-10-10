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
