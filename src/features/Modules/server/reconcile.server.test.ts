import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  companies: [] as { id: string }[],
  enabled: new Map<string, string[]>(),
  runDocs: vi.fn(),
  runHse: vi.fn(),
}));

vi.mock('@/shared/lib/prisma-system', () => ({
  prismaSystem: { company: { findMany: async () => mocks.companies } },
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { $transaction: async (fn: (tx: object) => Promise<void>) => fn({}) },
}));
vi.mock('@/shared/lib/tenant-context', () => ({
  runInCompanyScope: async (_company: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('./modules.server', () => ({
  getEnabledModulesFor: async (companyId: string) => new Set(mocks.enabled.get(companyId) ?? []),
}));
vi.mock('@/features/Documentacion/shared/compliance/server/document-status.server', () => ({
  reconcileDocumentStatus: mocks.runDocs,
}));
vi.mock('@/features/Hse/use-cases/sync-acknowledgements', () => ({ reconcileHse: mocks.runHse }));

import { reconcileKindsFor, resolveReconcileTargets, runReconcileOnEnable } from './reconcile.server';

describe('reconciliación al encender un módulo', () => {
  beforeEach(() => {
    mocks.companies = [{ id: 'A' }, { id: 'B' }];
    mocks.enabled = new Map([
      ['A', ['documentacion', 'hse']],
      ['B', ['hse']],
    ]);
    mocks.runDocs.mockReset().mockResolvedValue({ evaluated: 1, changed: 1 });
    mocks.runHse.mockReset().mockResolvedValue(undefined);
  });

  it('solo dispara lo que se enciende y tiene onEnable', () => {
    expect(reconcileKindsFor([{ key: 'documentacion', to: true }])).toEqual(['reconcile-documents']);
    expect(reconcileKindsFor([{ key: 'documentacion', to: false }])).toEqual([]);
    expect(reconcileKindsFor([{ key: 'gomeria', to: true }])).toEqual([]);
    expect(
      reconcileKindsFor([
        { key: 'hse', to: true },
        { key: 'documentacion', to: true },
      ]).sort()
    ).toEqual(['reconcile-documents', 'reconcile-hse']);
  });

  it('al encender en una empresa reconcilia esa empresa', async () => {
    const targets = await resolveReconcileTargets([
      { scope: 'company', companyId: 'A', key: 'documentacion', to: true },
    ]);
    expect(targets).toEqual([{ kind: 'reconcile-documents', companyId: 'A' }]);
  });

  it('al encender en la instancia alcanza solo a las empresas que lo tienen encendido', async () => {
    const targets = await resolveReconcileTargets([{ scope: 'instance', companyId: null, key: 'hse', to: true }]);
    expect(targets.map((t) => t.companyId).sort()).toEqual(['A', 'B']);
    const docs = await resolveReconcileTargets([
      { scope: 'instance', companyId: null, key: 'documentacion', to: true },
    ]);
    expect(docs).toEqual([{ kind: 'reconcile-documents', companyId: 'A' }]);
  });

  it('corre cada reconciliación y un fallo en una empresa no frena a las otras', async () => {
    mocks.runHse.mockRejectedValueOnce(new Error('boom'));
    const results = await runReconcileOnEnable([{ scope: 'instance', companyId: null, key: 'hse', to: true }]);
    expect(results.sort()).toEqual(['reconcile-hse:A:error', 'reconcile-hse:B:ok']);
  });
});
