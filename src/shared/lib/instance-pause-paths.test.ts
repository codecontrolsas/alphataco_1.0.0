import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAUSED_PAGE_PATH, classifyPausePath } from './instance-pause-paths';

/**
 * Qué corta la pausa de la instancia. La lista de `src/app/api/*` se lee del disco: una API nueva queda en pausa por
 * defecto, y si hubiera que dejarla exenta, este test obliga a decidirlo a propósito.
 */
const EXPECTED_API_KIND: Record<string, 'exempt' | 'api'> = {
  admin: 'exempt',
  auth: 'exempt',
  health: 'exempt',
  jobs: 'exempt',
  external: 'api',
  files: 'api',
  mobile: 'api',
  taskapp: 'api',
};

describe('classifyPausePath', () => {
  it('cada carpeta de src/app/api tiene una decisión explícita', () => {
    const dirs = readdirSync(path.join(process.cwd(), 'src/app/api'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual(Object.keys(EXPECTED_API_KIND).sort());
    for (const dir of dirs) expect(classifyPausePath(`/api/${dir}/x`), dir).toBe(EXPECTED_API_KIND[dir]);
  });

  it.each([
    ['/api/admin/v1/instance', 'exempt'],
    ['/api/admin/v1/status', 'exempt'],
    ['/api/health', 'exempt'],
    ['/api/jobs/documents-expiry', 'exempt'],
    ['/api/auth/sign-in/email', 'exempt'],
    ['/api/healthz', 'api'],
    ['/api/mobile/v1/me', 'api'],
    ['/api/external/v1/employees', 'api'],
    ['/api/files/logo/a.png', 'api'],
    ['/api', 'api'],
  ])('%s → %s', (pathname, kind) => {
    expect(classifyPausePath(pathname)).toBe(kind);
  });

  it('las pantallas de ingreso y la de pausa quedan abiertas; el resto de las páginas se corta', () => {
    for (const login of [
      '/login',
      '/login/',
      '/portal/login',
      '/operator/login',
      '/clothing/login',
      PAUSED_PAGE_PATH,
    ]) {
      expect(classifyPausePath(login), login).toBe('exempt');
    }
    for (const page of [
      '/',
      '/dashboard',
      '/dashboard/employee',
      '/manual',
      '/portal',
      '/maintenance',
      '/reset_password',
    ]) {
      expect(classifyPausePath(page), page).toBe('page');
    }
  });
});
