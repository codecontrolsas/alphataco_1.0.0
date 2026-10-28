import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Perímetro de las dos actions que fijan la empresa activa del flujo del QR.
 *
 * `completeMaintenanceEmployeeAnonymousSession` escribe el claim `company` de la sesión, que
 * `getActiveCompanyId()` trata como de confianza y NO revalida: que la sesión sea anónima es
 * lo que impide que un usuario del dashboard se plante la empresa de otro en su propia cuenta.
 */

const prismaMock = vi.hoisted(() => ({
  employees: { findFirst: vi.fn() },
  vehicles: { findUnique: vi.fn() },
  profile: { upsert: vi.fn(), findFirst: vi.fn() },
  user: { update: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: prismaMock }));

vi.mock('@/shared/lib/session', () => ({
  getSessionUser: vi.fn(),
  getSessionToken: vi.fn(async () => 'session-token'),
  isSessionAnonymous: vi.fn(),
}));

const claimsMock = vi.hoisted(() => ({
  writeMaintenanceClaims: vi.fn(),
  writeCompanyClaim: vi.fn(),
  canUserUseCompany: vi.fn(async () => false),
}));
vi.mock('@/shared/lib/session-claims', () => claimsMock);
const { writeMaintenanceClaims } = claimsMock;

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { signOut: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const tenantMock = vi.hoisted(() => ({
  setActiveCompanyCookie: vi.fn(),
  clearActiveCompanyCookie: vi.fn(),
  getActiveCompanyId: vi.fn(),
}));
vi.mock('@/shared/lib/tenant', () => tenantMock);

// Módulos del QR (F3.3): encendidos salvo que el test los apague.
const routesMock = vi.hoisted(() => ({ isRouteEnabledForCompany: vi.fn(async () => true) }));
vi.mock('@/features/Modules/server/public-routes.server', () => routesMock);
vi.mock('@/features/Modules/server/modules.server', () => ({
  MODULE_DISABLED_MESSAGE: 'Este módulo no está habilitado.',
}));

import { getSessionUser, isSessionAnonymous } from '@/shared/lib/session';
import { completeMaintenanceEmployeeAnonymousSession, setActiveCompanyForEquipment } from './maintenance-actions';

const EQUIPMENT = 'equipment-1';
const COMPANY_A = 'company-a';

describe('completeMaintenanceEmployeeAnonymousSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routesMock.isRouteEnabledForCompany.mockResolvedValue(true);
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user-1', email: null });
    vi.mocked(isSessionAnonymous).mockResolvedValue(true);
    prismaMock.employees.findFirst.mockResolvedValue({
      id: 'emp-1',
      firstname: 'Juan',
      lastname: 'Perez',
      email: null,
      phone: null,
      company_id: COMPANY_A,
      is_active: true,
    });
    prismaMock.profile.findFirst.mockResolvedValue(null);
    prismaMock.profile.upsert.mockResolvedValue({ id: 'user-1' });
  });

  it('completa la sesión del operario anónimo y fija la empresa del legajo', async () => {
    const result = await completeMaintenanceEmployeeAnonymousSession({ cuil: '20-12345678-9', equipmentId: EQUIPMENT });

    expect(result).toMatchObject({ ok: true, companyId: COMPANY_A, employeeId: 'emp-1' });
    expect(writeMaintenanceClaims).toHaveBeenCalledWith('session-token', {
      companyId: COMPANY_A,
      employeeId: 'emp-1',
    });
  });

  it('módulos del QR apagados para la empresa del legajo: no completa la sesión ni escribe claims', async () => {
    routesMock.isRouteEnabledForCompany.mockResolvedValue(false);

    const result = await completeMaintenanceEmployeeAnonymousSession({ cuil: '20-12345678-9', equipmentId: EQUIPMENT });

    expect(result).toEqual({ ok: false, error: 'Este módulo no está habilitado.' });
    expect(routesMock.isRouteEnabledForCompany).toHaveBeenCalledWith('/maintenance', COMPANY_A);
    expect(writeMaintenanceClaims).not.toHaveBeenCalled();
    expect(prismaMock.profile.upsert).not.toHaveBeenCalled();
  });

  it('rechaza una sesión de dashboard: no escribe el claim de empresa ni el de empleado', async () => {
    vi.mocked(isSessionAnonymous).mockResolvedValue(false);

    const result = await completeMaintenanceEmployeeAnonymousSession({ cuil: '20-12345678-9', equipmentId: EQUIPMENT });

    expect(result.ok).toBe(false);
    expect(writeMaintenanceClaims).not.toHaveBeenCalled();
    // Tampoco llega al upsert que pisaría el profile del usuario de dashboard.
    expect(prismaMock.profile.upsert).not.toHaveBeenCalled();
    expect(prismaMock.employees.findFirst).not.toHaveBeenCalled();
    expect(tenantMock.setActiveCompanyCookie).not.toHaveBeenCalled();
  });

  /**
   * El claim que escribe este flujo tiene que ser uno que `canUseCompanyAsTenant()` aceptaría, y
   * lo que lo hace caer en la rama de empleado es `profile.employee_id`. Sin esto, el del QR
   * sería el único claim del sistema que no pasa la regla con la que se valida la cookie.
   */
  it('el profile del operario queda vinculado al legajo', async () => {
    await completeMaintenanceEmployeeAnonymousSession({ cuil: '20-12345678-9', equipmentId: EQUIPMENT });

    expect(prismaMock.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ employee_id: 'emp-1' }),
        create: expect.objectContaining({ employee_id: 'emp-1' }),
      })
    );
  });

  /**
   * Antes, un legajo sin empresa caía a la empresa del VEHÍCULO escaneado, que sale de un
   * buscador público y no es la pertenencia de nadie: quien conociera ese CUIL se estampaba
   * como claim de confianza la empresa de cualquier equipo del sistema.
   */
  it('un legajo sin empresa NO cae a la empresa del equipo: se rechaza', async () => {
    prismaMock.employees.findFirst.mockResolvedValue({
      id: 'emp-1',
      firstname: 'Juan',
      lastname: 'Perez',
      email: null,
      phone: null,
      company_id: null,
      is_active: true,
    });

    const result = await completeMaintenanceEmployeeAnonymousSession({
      cuil: '20-12345678-9',
      equipmentId: EQUIPMENT,
    });

    expect(result.ok).toBe(false);
    expect(writeMaintenanceClaims).not.toHaveBeenCalled();
    expect(prismaMock.vehicles.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.profile.upsert).not.toHaveBeenCalled();
  });

  it('rechaza sin sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const result = await completeMaintenanceEmployeeAnonymousSession({ cuil: '20-12345678-9', equipmentId: EQUIPMENT });

    expect(result.ok).toBe(false);
    expect(writeMaintenanceClaims).not.toHaveBeenCalled();
  });
});

describe('setActiveCompanyForEquipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routesMock.isRouteEnabledForCompany.mockResolvedValue(true);
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'user-1', email: null });
    claimsMock.canUserUseCompany.mockResolvedValue(false);
    prismaMock.vehicles.findUnique.mockResolvedValue({ company_id: COMPANY_A });
  });

  it('propone la empresa del equipo escaneado cuando hay sesión', async () => {
    const result = await setActiveCompanyForEquipment(EQUIPMENT);

    expect(result).toMatchObject({ ok: true, companyId: COMPANY_A });
    expect(tenantMock.setActiveCompanyCookie).toHaveBeenCalledWith(COMPANY_A);
  });

  /**
   * La cookie es una propuesta que se revalida al leerla; el claim NO se revalida. Por eso el
   * invitado del QR sólo se lleva el claim si tiene un vínculo real con la empresa del equipo:
   * si no, escribir ahí la empresa de un vehículo elegido en un buscador público sería
   * exactamente el agujero que la invariante impide.
   */
  it('sin pertenencia real NO escribe el claim, sólo la cookie', async () => {
    claimsMock.canUserUseCompany.mockResolvedValue(false);

    await setActiveCompanyForEquipment(EQUIPMENT);

    expect(tenantMock.setActiveCompanyCookie).toHaveBeenCalledWith(COMPANY_A);
    expect(claimsMock.writeCompanyClaim).not.toHaveBeenCalled();
  });

  it('con pertenencia real escribe el claim, que es el que le gana a la cookie', async () => {
    claimsMock.canUserUseCompany.mockResolvedValue(true);

    await setActiveCompanyForEquipment(EQUIPMENT);

    expect(claimsMock.writeCompanyClaim).toHaveBeenCalledWith('session-token', COMPANY_A);
  });

  it('módulos del QR apagados para la empresa del equipo: no fija cookie ni claim', async () => {
    routesMock.isRouteEnabledForCompany.mockResolvedValue(false);
    claimsMock.canUserUseCompany.mockResolvedValue(true);

    const result = await setActiveCompanyForEquipment(EQUIPMENT);

    expect(result).toEqual({ ok: false, error: 'Este módulo no está habilitado.' });
    expect(tenantMock.setActiveCompanyCookie).not.toHaveBeenCalled();
    expect(claimsMock.writeCompanyClaim).not.toHaveBeenCalled();
  });

  it('sin sesión no escribe la cookie', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const result = await setActiveCompanyForEquipment(EQUIPMENT);

    expect(result.ok).toBe(false);
    expect(tenantMock.setActiveCompanyCookie).not.toHaveBeenCalled();
    expect(prismaMock.vehicles.findUnique).not.toHaveBeenCalled();
  });
});
