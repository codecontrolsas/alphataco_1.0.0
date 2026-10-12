import { describe, expect, it } from 'vitest';
import { defaultAccountStatementRange, defaultCustomerStatementRange } from './statement-range';

// 31/10 a las 23:30 de Argentina = 01/11 02:30 UTC: el proceso en UTC ya estaría en noviembre.
const LAST_NIGHT_OF_OCTOBER = new Date('2026-11-01T02:30:00.000Z');

describe('rangos por defecto de los extractos', () => {
  it('la cuenta corriente abre los últimos tres meses según el hoy de Argentina', () => {
    expect(defaultCustomerStatementRange(LAST_NIGHT_OF_OCTOBER)).toEqual({ from: '2026-08-01', to: '2026-10-31' });
  });
  it('el extracto de cuenta abre el mes en curso según el hoy de Argentina', () => {
    expect(defaultAccountStatementRange(LAST_NIGHT_OF_OCTOBER)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});
