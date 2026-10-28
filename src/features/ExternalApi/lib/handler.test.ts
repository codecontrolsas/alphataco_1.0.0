import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La API externa responde 404 `MODULE_DISABLED` cuando el módulo dueño del recurso está apagado para la empresa del
 * cliente (F3.3), y lo deja en el registro de accesos. Con el módulo encendido no cambia nada.
 */
const authenticate = vi.fn();
const logAccess = vi.fn();
const isModuleEnabledForCompany = vi.fn();

vi.mock('./auth', () => ({
  authenticateExternalApiRequest: authenticate,
  extractAttemptedClientId: () => null,
}));
vi.mock('./access-log', () => ({ logExternalApiAccess: logAccess }));
vi.mock('@/features/Modules/server/modules.server', () => ({ isModuleEnabledForCompany }));

function request() {
  return new NextRequest('http://localhost:3000/api/external/v1/employees');
}

async function handlerFor(endpoint: string, fetchList = vi.fn(async () => ({ data: [{ id: 1 }], total: 1 }))) {
  const { createExternalListHandler } = await import('./handler');
  const handler = createExternalListHandler({ endpoint, fetchList, toPublic: (row: { id: number }) => row });
  return { handler, fetchList };
}

describe('createExternalListHandler con módulos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.mockResolvedValue({ ok: true, client: { id: 'client-1', companyId: 'company-a' } });
  });

  it('módulo apagado para la empresa del cliente: 404 MODULE_DISABLED, sin consultar y con registro de acceso', async () => {
    isModuleEnabledForCompany.mockResolvedValue(false);
    const { handler, fetchList } = await handlerFor('employees');

    const response = await handler(request());

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('MODULE_DISABLED');
    expect(fetchList).not.toHaveBeenCalled();
    expect(isModuleEnabledForCompany).toHaveBeenCalledWith('empleados', 'company-a');
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, errorMessage: 'MODULE_DISABLED' })
    );
  });

  it('módulo encendido: responde el listado', async () => {
    isModuleEnabledForCompany.mockResolvedValue(true);
    const { handler, fetchList } = await handlerFor('vehicles');

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(fetchList).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-a' }));
    expect(isModuleEnabledForCompany).toHaveBeenCalledWith('equipos', 'company-a');
  });

  it('sin credencial válida no llega a mirar el módulo (401 antes que 404)', async () => {
    authenticate.mockResolvedValue({ ok: false, status: 401, code: 'UNAUTHORIZED', message: 'no' });
    const { handler } = await handlerFor('employees');

    expect((await handler(request())).status).toBe(401);
    expect(isModuleEnabledForCompany).not.toHaveBeenCalled();
  });
});
