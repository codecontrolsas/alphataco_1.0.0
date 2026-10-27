import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Proxy: los enlaces viejos `?tab=manual[&guide=…]` redirigen a `/manual` desde CUALQUIER ruta del dashboard (antes
 * solo lo hacía la página de Ayuda, y desde `/dashboard` o Configuración quedaban en la página sin manual).
 */
const getSession = vi.hoisted(() => vi.fn());
const queryRaw = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: { $queryRaw: queryRaw } }));
vi.mock('@/shared/lib/session-claims', () => ({
  resolveDefaultCompanyId: vi.fn(async () => null),
  writeCompanyClaim: vi.fn(async () => undefined),
}));

const COMPANY = '11111111-1111-4111-8111-111111111111';

async function run(url: string) {
  const { proxy } = await import('./proxy');
  return proxy(new NextRequest(url));
}

describe('proxy: enlaces viejos al manual', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      user: { id: '22222222-2222-4222-8222-222222222222', isAnonymous: false },
      session: { company: COMPANY, token: 't' },
    });
    queryRaw.mockResolvedValue([{ employee_only: false }]);
  });

  it.each([
    ['/dashboard?tab=manual', 'http://app.test/manual'],
    ['/dashboard/configuration?tab=manual&guide=alta-empleado', 'http://app.test/manual?guide=alta-empleado'],
    ['/dashboard/help?tab=manual&guide=partes', 'http://app.test/manual?guide=partes'],
  ])('%s → %s', async (path, location) => {
    const response = await run(`http://app.test${path}`);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(location);
  });

  it('otras pestañas siguen de largo', async () => {
    const response = await run('http://app.test/dashboard/configuration?tab=general');
    expect(response.headers.get('location')).toBeNull();
  });

  it('sin sesión va primero al login', async () => {
    getSession.mockResolvedValue(null);
    const response = await run('http://app.test/dashboard?tab=manual');
    expect(response.headers.get('location')).toContain('/login');
  });
});
