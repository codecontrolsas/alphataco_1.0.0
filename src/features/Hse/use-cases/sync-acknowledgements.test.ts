import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enabled: true }));
vi.mock('@/features/Modules/server/modules.server', () => ({
  isModuleEnabledForCompany: async () => mocks.enabled,
}));

import { reconcileHse, syncHseAcknowledgements, syncHseTrainingAssignments } from './sync-acknowledgements';

describe('sincronización HSE con el módulo hse', () => {
  const tx = { $executeRaw: vi.fn() };
  beforeEach(() => {
    mocks.enabled = true;
    tx.$executeRaw.mockReset().mockResolvedValue(0);
  });

  it('apagado: no concilia aceptaciones ni capacitaciones (la función SQL saltea la RLS)', async () => {
    mocks.enabled = false;
    await syncHseAcknowledgements(tx, { companyId: 'c1', employeeId: 'e1' });
    await syncHseTrainingAssignments(tx, { companyId: 'c1' });
    await reconcileHse(tx, 'c1');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('encendido: concilia aceptaciones y capacitaciones', async () => {
    await syncHseAcknowledgements(tx, { companyId: 'c1', employeeId: 'e1' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
