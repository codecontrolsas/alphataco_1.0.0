import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El módulo dueño de un job apagado para una empresa saltea SOLO a esa empresa (F3.3): la corrida queda cerrada como
 * `skipped` con el motivo, el trabajo no corre, y un fallo al leer el estado es un ERROR (no un «módulo apagado»).
 */
const claimRun = vi.fn();
const finishRun = vi.fn();
const readEnabledModules = vi.fn();

vi.mock('./runs', () => ({ claimRun, finishRun, recordRunStart: vi.fn() }));
vi.mock('@/features/Modules/server/modules.server', () => ({ readEnabledModules }));
vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: {} }));
vi.mock('@/shared/lib/tenant-context', () => ({
  runInCompanyScope: async (_companyId: string, work: () => Promise<unknown>) => work(),
}));

const COMPANIES = [
  { id: 'company-a', company_name: 'A' },
  { id: 'company-b', company_name: 'B' },
];

async function run(
  job: 'daily-report-deviations' | 'daily-indicators',
  work = vi.fn(async () => ({ reason: 'hecho' }))
) {
  const { runForEachCompany } = await import('./per-company');
  const outcomes = await runForEachCompany({ job, date: '2026-06-15', companies: COMPANIES, work });
  return { outcomes, work };
}

describe('runForEachCompany con el módulo dueño del job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimRun.mockImplementation(async ({ companyId }: { companyId: string }) => ({
      id: `run-${companyId}`,
      attempts: 1,
    }));
    finishRun.mockResolvedValue(undefined);
  });

  it('saltea la empresa con el módulo apagado y corre la otra', async () => {
    readEnabledModules.mockImplementation(
      async (companyId: string) => new Set(companyId === 'company-a' ? ['nucleo'] : ['nucleo', 'operaciones'])
    );

    const { outcomes, work } = await run('daily-report-deviations');

    expect(outcomes.map((outcome) => [outcome.companyId, outcome.status])).toEqual([
      ['company-a', 'skipped'],
      ['company-b', 'ok'],
    ]);
    expect(outcomes[0]?.reason).toBe('módulo operaciones apagado');
    expect(work).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(COMPANIES[1]);
    // La corrida de A se cierra `skipped` (reclamable si se enciende el mismo día) con el módulo en la metadata.
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-company-a',
        status: 'skipped',
        metadata: expect.objectContaining({ module: 'operaciones' }),
      })
    );
  });

  it('un job del núcleo no consulta el estado de los módulos', async () => {
    const { outcomes } = await run('daily-indicators');

    expect(readEnabledModules).not.toHaveBeenCalled();
    expect(outcomes.every((outcome) => outcome.status === 'ok')).toBe(true);
  });

  it('si el estado no se puede leer, la empresa queda en error y el trabajo no corre', async () => {
    readEnabledModules.mockRejectedValue(new Error('base caída'));

    const { outcomes, work } = await run('daily-report-deviations');

    expect(outcomes.every((outcome) => outcome.status === 'error')).toBe(true);
    expect(work).not.toHaveBeenCalled();
    expect(finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', error: 'base caída' }));
  });
});
