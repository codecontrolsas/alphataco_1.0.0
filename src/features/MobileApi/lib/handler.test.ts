import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Compuerta de módulos de la API móvil (F3.3): la clave `movil` y la clave de la ruta tienen que estar encendidas.
 * Sin autenticación solo se mira la instancia; autenticada, la empresa del token. Apagado: 404 `MODULE_DISABLED`.
 */
const getEnabledModulesFor = vi.fn();
const resolveMobileContext = vi.fn();

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/features/Modules/server/modules.server', () => ({ getEnabledModulesFor }));
vi.mock('./context', () => ({ resolveMobileContext }));

const CTX = { companyId: 'company-a', userId: 'user-1', kind: 'user' as const };

async function call(config: Parameters<typeof import('./handler').mobileRoute>[0]) {
  const { mobileRoute } = await import('./handler');
  const response = await mobileRoute(config)(new Request('http://localhost/api/mobile/v1/x'), {
    params: Promise.resolve({}),
  });
  return { status: response.status, body: await response.json() };
}

describe('mobileRoute con módulos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MOBILE_API_ENABLED', 'true');
    resolveMobileContext.mockResolvedValue({ ok: true, ctx: CTX, sessionToken: 't' });
  });

  it('ruta autenticada con su módulo apagado en la empresa: 404 MODULE_DISABLED y no corre', async () => {
    getEnabledModulesFor.mockResolvedValue(new Set(['nucleo', 'movil']));
    const run = vi.fn(async () => Response.json({ ok: true }));

    const { status, body } = await call({ module: 'operaciones', run });

    expect(status).toBe(404);
    expect(body.error.code).toBe('MODULE_DISABLED');
    expect(run).not.toHaveBeenCalled();
    expect(getEnabledModulesFor).toHaveBeenCalledWith('company-a');
  });

  it('con `movil` y el módulo de la ruta encendidos corre', async () => {
    getEnabledModulesFor.mockResolvedValue(new Set(['nucleo', 'movil', 'operaciones']));
    const run = vi.fn(async () => Response.json({ ok: true }));

    expect((await call({ module: 'operaciones', run })).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('`movil` apagado corta toda la API aunque el módulo de la ruta esté encendido', async () => {
    getEnabledModulesFor.mockResolvedValue(new Set(['nucleo', 'operaciones']));
    const run = vi.fn(async () => Response.json({ ok: true }));

    expect((await call({ module: 'operaciones', run })).status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it('sin autenticación solo mira la instancia (empresa null)', async () => {
    getEnabledModulesFor.mockResolvedValue(new Set(['nucleo', 'movil']));
    const run = vi.fn(async () => Response.json({ ok: true }));

    expect((await call({ auth: false, run })).status).toBe(200);
    expect(getEnabledModulesFor).toHaveBeenCalledWith(null);
    expect(resolveMobileContext).not.toHaveBeenCalled();
  });

  it('la API apagada por entorno sigue respondiendo MOBILE_API_DISABLED antes de mirar módulos', async () => {
    vi.stubEnv('MOBILE_API_ENABLED', 'false');
    const { status, body } = await call({ auth: false, run: async () => Response.json({}) });

    expect(status).toBe(404);
    expect(body.error.code).toBe('MOBILE_API_DISABLED');
    expect(getEnabledModulesFor).not.toHaveBeenCalled();
  });
});

describe('mobileModulesFor', () => {
  it('informa solo las entradas cuya clave dueña está encendida', async () => {
    const { mobileModulesFor } = await import('./config');
    expect(mobileModulesFor(new Set(['nucleo', 'empleados']))).toEqual(['empleados.employees']);
    expect(mobileModulesFor(new Set(['nucleo', 'operaciones']))).toEqual([
      'operaciones.daily-report-rows',
      'operaciones.daily-reports',
      'operaciones.resources',
    ]);
    expect(mobileModulesFor(new Set(['nucleo']))).toEqual([]);
  });
});
