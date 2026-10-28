import { describe, expect, it, vi } from 'vitest';
import type { ModuleKey } from '../catalog';

vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: {} }));
vi.mock('./modules.server', () => ({ getEnabledModulesFor: vi.fn() }));

/**
 * El QR de mantenimiento sirve a tres claves: alcanza con que esté encendida ALGUNA para la raíz y el dashboard del
 * equipo, y cada subruta exige la suya (F3.3). Una clave apagada con otra encendida no corta la raíz.
 */
describe('isRouteEnabled', () => {
  const on = (...keys: ModuleKey[]): ReadonlySet<ModuleKey> => new Set<ModuleKey>(['nucleo', ...keys]);

  it('la raíz y el dashboard del equipo piden alguna de las tres claves del QR', async () => {
    const { isRouteEnabled } = await import('./public-routes.server');
    for (const path of ['/maintenance', '/maintenance/equipment/e1']) {
      expect(isRouteEnabled(path, on('checklists'))).toBe(true);
      expect(isRouteEnabled(path, on('gomeria'))).toBe(true);
      expect(isRouteEnabled(path, on('equipos'))).toBe(false);
    }
  });

  it('cada subruta exige su clave', async () => {
    const { isRouteEnabled } = await import('./public-routes.server');
    expect(isRouteEnabled('/maintenance/equipment/e1/checklists', on('checklists'))).toBe(true);
    expect(isRouteEnabled('/maintenance/equipment/e1/checklists', on('mantenimiento', 'gomeria'))).toBe(false);
    expect(isRouteEnabled('/maintenance/equipment/e1/tire-service', on('gomeria'))).toBe(true);
    expect(isRouteEnabled('/maintenance/equipment/e1/tire-service', on('mantenimiento'))).toBe(false);
    expect(isRouteEnabled('/maintenance/equipment/e1/request', on('mantenimiento'))).toBe(true);
    expect(isRouteEnabled('/maintenance/equipment/e1/request', on('checklists'))).toBe(false);
  });

  it('operario e indumentaria: su clave', async () => {
    const { isRouteEnabled } = await import('./public-routes.server');
    expect(isRouteEnabled('/operator', on('mantenimiento'))).toBe(true);
    expect(isRouteEnabled('/operator/dashboard', on('indumentaria'))).toBe(false);
    expect(isRouteEnabled('/clothing/delivery', on('indumentaria'))).toBe(true);
    expect(isRouteEnabled('/clothing/delivery', on('mantenimiento'))).toBe(false);
  });
});
