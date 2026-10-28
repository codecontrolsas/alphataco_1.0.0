import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  load: vi.fn(),
}));

vi.mock('@/features/Modules/server/modules.server', () => ({
  isModuleEnabledForCompany: async () => mocks.enabled,
}));
vi.mock('./dataset.server', () => ({
  loadComplianceDataset: mocks.load,
  evaluateDataset: () => new Map(),
}));

import { refreshDocumentStatus, refreshResourceStatus } from './document-status.server';

const db = { $queryRaw: vi.fn(), $executeRaw: vi.fn() } as never;

describe('refreshDocumentStatus con el módulo documentacion', () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.load.mockReset().mockResolvedValue({ resources: [] });
  });

  it('apagado: no lee ni escribe nada y devuelve 0 (el caché queda congelado)', async () => {
    mocks.enabled = false;
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(refreshDocumentStatus(db, 'Persona', { companyId: 'c1' })).resolves.toEqual({
      evaluated: 0,
      changed: 0,
    });
    await expect(refreshResourceStatus(db, 'Persona', 'c1', id)).resolves.toEqual({ evaluated: 0, changed: 0 });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('encendido: evalúa a la empresa', async () => {
    await refreshDocumentStatus(db, 'Persona', { companyId: 'c1' });
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
});
