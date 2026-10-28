import { assertHseEnabled, isHseEnabled, withoutDisabledHse } from '@/features/Hse/lib/feature-gate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPortalEnabled, assertPortalEnabledByEnv, isPortalEnabled } from './feature-gate';

/**
 * Compuertas del portal y de HSE (F3.1): decide el estado del módulo y, mientras existan, `PORTAL_ENABLED=false` y
 * `HSE_ENABLED=false` lo apagan igual que antes. Si el estado no se puede leer, manda la variable (compatibilidad).
 */
const moduleState = vi.hoisted(() => ({
  enabled: new Set<string>(['hse', 'portal']),
  fail: false,
  lastCompany: undefined as unknown,
}));

vi.mock('@/features/Modules/server/modules.server', () => ({
  isModuleEnabledOrLegacy: async (key: string, companyId?: string | null) => {
    moduleState.lastCompany = companyId;
    if (moduleState.fail) return true;
    return moduleState.enabled.has(key);
  },
}));

const digestOf = async (fn: () => unknown): Promise<string | undefined> => {
  try {
    await fn();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
};

describe('compuertas del portal y de HSE', () => {
  beforeEach(() => {
    moduleState.enabled = new Set(['hse', 'portal']);
    moduleState.fail = false;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin variables y con los módulos encendidos, no cortan la ruta', async () => {
    vi.stubEnv('PORTAL_ENABLED', '');
    vi.stubEnv('HSE_ENABLED', '');
    expect(await isPortalEnabled()).toBe(true);
    expect(await isHseEnabled()).toBe(true);
    expect(await digestOf(() => assertPortalEnabled())).toBeUndefined();
    expect(await digestOf(assertHseEnabled)).toBeUndefined();
    expect(withoutDisabledHse(['empleados', 'hse'])).toEqual(['empleados', 'hse']);
  });

  it('PORTAL_ENABLED=false: 404 aunque el módulo esté encendido (también el corte síncrono del layout)', async () => {
    vi.stubEnv('PORTAL_ENABLED', 'false');
    expect(await isPortalEnabled()).toBe(false);
    expect(await digestOf(() => assertPortalEnabled())).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(await digestOf(assertPortalEnabledByEnv)).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('HSE_ENABLED=false: 404 y fuera de la navegación', async () => {
    vi.stubEnv('HSE_ENABLED', 'false');
    expect(await digestOf(assertHseEnabled)).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(withoutDisabledHse(['empleados', 'hse', 'equipos'])).toEqual(['empleados', 'equipos']);
  });

  it('módulo apagado (sin variable): 404, y la empresa conocida viaja a la consulta', async () => {
    moduleState.enabled = new Set();
    expect(await isHseEnabled('empresa-1')).toBe(false);
    expect(moduleState.lastCompany).toBe('empresa-1');
    expect(await digestOf(() => assertPortalEnabled('empresa-2'))).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    // El corte síncrono del layout solo mira la variable.
    expect(await digestOf(assertPortalEnabledByEnv)).toBeUndefined();
  });

  it('estado ilegible: se comporta como antes de F3 (manda la variable)', async () => {
    moduleState.fail = true;
    expect(await isHseEnabled()).toBe(true);
    vi.stubEnv('HSE_ENABLED', 'false');
    expect(await isHseEnabled()).toBe(false);
  });

  it('solo el texto exacto «false» apaga (cualquier otro valor deja prendido)', async () => {
    vi.stubEnv('PORTAL_ENABLED', '0');
    expect(await isPortalEnabled()).toBe(true);
  });
});
