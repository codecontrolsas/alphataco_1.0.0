import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
const send = vi.fn();

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock('@/shared/lib/s3', () => ({ s3Client: () => ({ send }) }));

/** El módulo cachea el estado del storage: cada caso arranca con un módulo nuevo. */
async function loadRoute() {
  vi.resetModules();
  return import('./route');
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    send.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('responde 200 con storage ok cuando la base y el storage andan', async () => {
    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', storage: 'ok' });
  });

  it('informa storage error pero mantiene 200 si RustFS falla (no debe reiniciar el contenedor)', async () => {
    send.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', storage: 'error' });
  });

  it('responde 503 si la base no está disponible', async () => {
    queryRaw.mockRejectedValue(new Error('db down'));
    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'db_unavailable' });
    expect(send).not.toHaveBeenCalled();
  });

  it('consulta el storage una vez por minuto y no en cada health check', async () => {
    const { GET } = await loadRoute();

    await GET();
    await GET();
    expect(send).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-21T12:01:01Z'));
    await GET();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('recuerda un error del storage solo 10 s, para recuperarse rápido de un fallo pasajero', async () => {
    send.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({});
    const { GET } = await loadRoute();

    expect(await (await GET()).json()).toMatchObject({ storage: 'error' });

    vi.setSystemTime(new Date('2026-10-21T12:00:05Z'));
    expect(await (await GET()).json()).toMatchObject({ storage: 'error' });
    expect(send).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-21T12:00:11Z'));
    expect(await (await GET()).json()).toMatchObject({ storage: 'ok' });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
