import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Proxy: los enlaces viejos `?tab=manual[&guide=…]` redirigen a `/manual` desde CUALQUIER ruta del dashboard (antes
 * solo lo hacía la página de Ayuda, y desde `/dashboard` o Configuración quedaban en la página sin manual).
 */
const getSession = vi.hoisted(() => vi.fn());
const queryRaw = vi.hoisted(() => vi.fn());
const controls = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: { $queryRaw: queryRaw } }));
vi.mock('@/shared/lib/instance-controls', () => ({ getInstanceControlsCached: controls }));
vi.mock('@/shared/lib/session-claims', () => ({
  resolveDefaultCompanyId: vi.fn(async () => null),
  writeCompanyClaim: vi.fn(async () => undefined),
}));

const COMPANY = '11111111-1111-4111-8111-111111111111';

const OFF = {
  pause: { active: false, message: '', since: null },
  banners: {
    login: { enabled: false, message: '', severity: 'info' },
    dashboard: { enabled: false, message: '', severity: 'info' },
  },
};
const PAUSED = { ...OFF, pause: { active: true, message: 'Volvemos a las 16 h', since: '2026-10-29T15:00:00.000Z' } };

beforeEach(() => {
  controls.mockReset();
  controls.mockResolvedValue(OFF);
});

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

describe('proxy: quién entra al dashboard', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      user: { id: '22222222-2222-4222-8222-222222222222', isAnonymous: false },
      session: { company: COMPANY, token: 't' },
    });
    queryRaw.mockResolvedValue([{ employee_only: false }]);
  });

  it('solo empleado (legajo sin membresía ni empresa propia): va al portal, aunque la sesión tenga empresa', async () => {
    queryRaw.mockResolvedValue([{ employee_only: true }]);
    const response = await run('http://app.test/dashboard/employee');
    expect(response.headers.get('location')).toBe('http://app.test/portal');
  });

  it('sin perfil (la consulta no devuelve fila) no se lo trata como empleado', async () => {
    queryRaw.mockResolvedValue([]);
    const response = await run('http://app.test/dashboard');
    expect(response.headers.get('location')).toBeNull();
  });

  it('el operario anónimo del QR va a /maintenance', async () => {
    getSession.mockResolvedValue({ user: { id: 'x', isAnonymous: true }, session: { company: COMPANY, token: 't' } });
    const response = await run('http://app.test/dashboard');
    expect(response.headers.get('location')).toBe('http://app.test/maintenance');
  });

  it('sin empresa resoluble va al alta de empresa (y ahí no rebota)', async () => {
    getSession.mockResolvedValue({
      user: { id: '22222222-2222-4222-8222-222222222222', isAnonymous: false },
      session: { company: null, token: 't' },
    });
    expect((await run('http://app.test/dashboard')).headers.get('location')).toBe(
      'http://app.test/dashboard/configuration/companies/new'
    );
    expect((await run('http://app.test/dashboard/configuration/companies/new')).headers.get('location')).toBeNull();
  });

  it('sin sesión recuerda adónde iba (solo en GET)', async () => {
    getSession.mockResolvedValue(null);
    const response = await run('http://app.test/dashboard/hse?tab=actas');
    expect(response.headers.get('location')).toBe('http://app.test/login?next=%2Fdashboard%2Fhse%3Ftab%3Dactas');
  });
});

describe('proxy: módulos apagados (F3)', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      user: { id: '22222222-2222-4222-8222-222222222222', isAnonymous: false },
      session: { company: COMPANY, token: 't' },
    });
  });

  it('la página de un módulo apagado responde 404 antes de renderizar', async () => {
    queryRaw.mockResolvedValueOnce([{ employee_only: false }]).mockResolvedValueOnce([{ enabled: false }]);
    const response = await run('http://app.test/dashboard/maintenance?tab=gomeria');
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toContain('/_modulo-no-disponible');
  });

  it('encendido sigue de largo; el núcleo ni consulta', async () => {
    queryRaw.mockResolvedValueOnce([{ employee_only: false }]).mockResolvedValueOnce([{ enabled: true }]);
    expect((await run('http://app.test/dashboard/hse')).status).toBe(200);
    queryRaw.mockClear();
    queryRaw.mockResolvedValue([{ employee_only: false }]);
    expect((await run('http://app.test/dashboard/configuration')).status).toBe(200);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('si la base no responde no se corta (los permisos ya filtran)', async () => {
    queryRaw.mockResolvedValueOnce([{ employee_only: false }]).mockRejectedValueOnce(new Error('db caída'));
    expect((await run('http://app.test/dashboard/warehouse')).status).toBe(200);
  });
});

describe('proxy: pausa de la instancia', () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue({
      user: { id: '22222222-2222-4222-8222-222222222222', isAnonymous: false },
      session: { company: COMPANY, token: 't' },
    });
    queryRaw.mockResolvedValue([{ employee_only: false }]);
    controls.mockResolvedValue(PAUSED);
  });

  it.each(['/api/mobile/v1/me', '/api/external/v1/employees', '/api/files/logo/a.png', '/api/taskapp/events'])(
    'la API %s responde 503 INSTANCE_PAUSED con el mensaje',
    async (path) => {
      const response = await run(`http://app.test${path}`);
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('120');
      await expect(response.json()).resolves.toEqual({
        error: { code: 'INSTANCE_PAUSED', message: 'Volvemos a las 16 h' },
      });
    }
  );

  it.each(['/dashboard', '/dashboard/employee', '/portal', '/maintenance', '/'])(
    'la página %s se reescribe a la pantalla de pausa con 503, sin mirar la sesión',
    async (path) => {
      const response = await run(`http://app.test${path}`);
      expect(response.status).toBe(503);
      expect(response.headers.get('x-middleware-rewrite')).toContain('/sistema-en-pausa');
      expect(getSession).not.toHaveBeenCalled();
    }
  );

  it.each(['/api/admin/v1/instance', '/api/health', '/api/jobs/documents-expiry', '/api/auth/sign-in/email', '/login'])(
    '%s sigue funcionando en pausa (ni consulta la pausa)',
    async (path) => {
      const response = await run(`http://app.test${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
      expect(controls).not.toHaveBeenCalled();
    }
  );

  it('sin pausa, las rutas fuera del dashboard siguen de largo sin leer la sesión', async () => {
    controls.mockResolvedValue(OFF);
    for (const path of ['/portal', '/api/mobile/v1/me', '/maintenance']) {
      const response = await run(`http://app.test${path}`);
      expect(response.status).toBe(200);
    }
    expect(getSession).not.toHaveBeenCalled();
  });
});
