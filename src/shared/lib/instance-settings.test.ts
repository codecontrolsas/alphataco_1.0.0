import { describe, expect, it, vi } from 'vitest';

vi.mock('./prisma-system', () => ({ prismaSystem: {} }));

/** Lectura de `instance_settings.max_companies` (ticket 807): normalización del valor y textos del límite. */
describe('límite de empresas de la instancia', () => {
  it('parseMaxCompanies: enteros ≥ 1 (también como texto); todo lo demás es inválido', async () => {
    const { parseMaxCompanies } = await import('./instance-settings');
    expect(parseMaxCompanies(1)).toBe(1);
    expect(parseMaxCompanies(12)).toBe(12);
    expect(parseMaxCompanies('3')).toBe(3);
    expect(parseMaxCompanies(' 4 ')).toBe(4);
    for (const invalid of [0, -1, 1.5, '1.5', '', '  ', 'tres', null, undefined, true, { max: 2 }, [2], Number.NaN]) {
      expect(parseMaxCompanies(invalid), String(invalid)).toBeNull();
    }
  });

  it('readMaxCompanies: 1 si la fila falta o el valor es inválido', async () => {
    const { readMaxCompanies } = await import('./instance-settings');
    const reader = (value: unknown) => ({
      instance_settings: { findUnique: async () => (value === undefined ? null : { value }) },
    });
    await expect(readMaxCompanies(reader(undefined) as never)).resolves.toBe(1);
    await expect(readMaxCompanies(reader('cinco') as never)).resolves.toBe(1);
    await expect(readMaxCompanies(reader(5) as never)).resolves.toBe(5);
  });

  it('textos en singular y plural', async () => {
    const { companyLimitLabel, companyLimitReachedText } = await import('./instance-settings');
    expect(companyLimitLabel(1)).toBe('Tu plan permite 1 empresa');
    expect(companyLimitLabel(3)).toBe('Tu plan permite 3 empresas');
    expect(companyLimitReachedText(1)).toBe('Tu plan permite 1 empresa y ya está en uso');
    expect(companyLimitReachedText(3)).toBe('Tu plan permite 3 empresas y ya están todas en uso');
  });

  it('companyHeaderMode: con max_companies = 1 nunca hay selector; con N > 1, selector si hay más de una o lugar', async () => {
    const { companyHeaderMode } = await import('./instance-settings');
    expect(companyHeaderMode({ max: 1, reached: true }, 1)).toBe('identity');
    expect(companyHeaderMode({ max: 1, reached: false }, 0)).toBe('identity');
    // N = 2 con una empresa: el selector lleva el botón «Agregar compañía».
    expect(companyHeaderMode({ max: 2, reached: false }, 1)).toBe('switcher');
    // Al llegar a N: el botón desaparece, el selector queda si el usuario tiene más de una.
    expect(companyHeaderMode({ max: 2, reached: true }, 2)).toBe('switcher');
    expect(companyHeaderMode({ max: 2, reached: true }, 1)).toBe('identity');
  });
});
