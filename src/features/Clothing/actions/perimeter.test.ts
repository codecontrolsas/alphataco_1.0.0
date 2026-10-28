import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El corte de sesión anónima de los dos paneles de operario.
 *
 * Desde que el login del QR escribe `profile.employee_id` —lo que hace que su claim de empresa
 * satisfaga la regla de pertenencia—, "tener legajo vinculado" dejó de alcanzar para entrar a
 * estos paneles: cualquiera que escanee un QR y tipee un CUIL tendría un profile con legajo. A
 * los dos paneles se entra con email y contraseña, así que exigen sesión NO anónima.
 *
 * Es el caso que la review de P2 había marcado como riesgo y que esta ronda activó.
 */
const prismaMock = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  employees: { findUnique: vi.fn() },
  employee_workshop_sectors: { findMany: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: vi.fn(async () => 'cred-1'),
  isSessionAnonymous: vi.fn(async () => false),
}));

// Estado de los módulos (F3.3): encendido salvo que el test lo apague.
const moduleMock = vi.hoisted(() => ({ isModuleEnabledForCompany: vi.fn(async () => true) }));
vi.mock('@/features/Modules/server/modules.server', () => ({
  ...moduleMock,
  ModuleDisabledError: class ModuleDisabledError extends Error {
    constructor(readonly module: string) {
      super(`El módulo ${module} no está habilitado.`);
    }
  },
}));

import { getOperatorIdentity, requireOperatorIdentity } from '@/features/OperatorPanel/actions/perimeter';
import { isSessionAnonymous } from '@/shared/lib/session';
import { getClothingOperator, requireClothingOperator } from './perimeter';

describe('perímetros de los paneles de operario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moduleMock.isModuleEnabledForCompany.mockResolvedValue(true);
    vi.mocked(isSessionAnonymous).mockResolvedValue(false);
    prismaMock.profile.findUnique.mockResolvedValue({ id: 'prof-1', employee_id: 'emp-1' });
    prismaMock.employees.findUnique.mockResolvedValue({
      id: 'emp-1',
      firstname: 'Ana',
      lastname: 'Perez',
      file: '123',
      company_id: 'company-a',
    });
    prismaMock.employee_workshop_sectors.findMany.mockResolvedValue([
      { workshop_sectors: { id: 'sec-1', name: 'Sector', workshop_id: 'w-1', workshops: { name: 'Taller' } } },
    ]);
  });

  it('indumentaria: con sesión de usuario devuelve al operario', async () => {
    await expect(getClothingOperator()).resolves.toMatchObject({ employeeId: 'emp-1', companyId: 'company-a' });
  });

  it('indumentaria: una sesión ANÓNIMA del QR no es operario, aunque tenga legajo', async () => {
    vi.mocked(isSessionAnonymous).mockResolvedValue(true);

    await expect(getClothingOperator()).resolves.toBeNull();
    // Corta antes de tocar la base: el legajo del QR ni se mira.
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('taller: con sesión de usuario devuelve la identidad del operario', async () => {
    await expect(getOperatorIdentity()).resolves.toMatchObject({ employeeId: 'emp-1', companyId: 'company-a' });
  });

  it('taller: una sesión ANÓNIMA del QR tampoco entra', async () => {
    vi.mocked(isSessionAnonymous).mockResolvedValue(true);

    await expect(getOperatorIdentity()).resolves.toBeNull();
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('módulos: las actions del panel de ropa y del taller no operan si el módulo de su empresa está apagado', async () => {
    moduleMock.isModuleEnabledForCompany.mockResolvedValue(false);

    await expect(requireClothingOperator()).rejects.toThrow('indumentaria');
    await expect(requireOperatorIdentity()).rejects.toThrow('mantenimiento');
    expect(moduleMock.isModuleEnabledForCompany).toHaveBeenCalledWith('indumentaria', 'company-a');
    expect(moduleMock.isModuleEnabledForCompany).toHaveBeenCalledWith('mantenimiento', 'company-a');

    moduleMock.isModuleEnabledForCompany.mockResolvedValue(true);
    await expect(requireClothingOperator()).resolves.toMatchObject({ companyId: 'company-a' });
    await expect(requireOperatorIdentity()).resolves.toMatchObject({ companyId: 'company-a' });
  });
});
