import { assertHseEnabled, isHseEnabled, withoutDisabledHse } from '@/features/Hse/lib/feature-gate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPortalEnabled, isPortalEnabled } from './feature-gate';

/**
 * Compuertas de la instancia: `PORTAL_ENABLED=false` apaga el portal (las rutas responden 404) y `HSE_ENABLED=false`
 * apaga HSE (404 y fuera de la navegación). Sin la variable, prendidos.
 */
const digestOf = (fn: () => void): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
};

describe('compuertas del portal y de HSE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin variables, el portal y HSE están prendidos y no cortan la ruta', () => {
    vi.stubEnv('PORTAL_ENABLED', '');
    vi.stubEnv('HSE_ENABLED', '');
    expect(isPortalEnabled()).toBe(true);
    expect(isHseEnabled()).toBe(true);
    expect(digestOf(assertPortalEnabled)).toBeUndefined();
    expect(digestOf(assertHseEnabled)).toBeUndefined();
    expect(withoutDisabledHse(['empleados', 'hse'])).toEqual(['empleados', 'hse']);
  });

  it('PORTAL_ENABLED=false: assertPortalEnabled responde 404', () => {
    vi.stubEnv('PORTAL_ENABLED', 'false');
    expect(isPortalEnabled()).toBe(false);
    expect(digestOf(assertPortalEnabled)).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('HSE_ENABLED=false: 404 y fuera de la navegación', () => {
    vi.stubEnv('HSE_ENABLED', 'false');
    expect(digestOf(assertHseEnabled)).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(withoutDisabledHse(['empleados', 'hse', 'equipos'])).toEqual(['empleados', 'equipos']);
  });

  it('solo el texto exacto «false» apaga (cualquier otro valor deja prendido)', () => {
    vi.stubEnv('PORTAL_ENABLED', '0');
    expect(isPortalEnabled()).toBe(true);
  });
});
