import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: vi.fn(),
  getSessionCompanyClaim: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  share_company_users: { findFirst: vi.fn() },
  employees: { findFirst: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock, prismaBase: prismaMock }));
vi.mock('@/shared/lib/prisma-system', () => ({ prismaSystem: prismaMock }));

import { getSessionCompanyClaim, getSessionUserId } from '@/shared/lib/session';
import { cookies } from 'next/headers';
import { canUseAsActiveCompany, getActiveCompanyId, NoActiveCompanyError } from './tenant';

const COMPANY = '2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e';
const OTHER_COMPANY = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** Cookie `actualComp` del request (o ninguna si `value` es undefined). */
const mockCookie = (value: string | undefined) => {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === 'actualComp' && value !== undefined ? { value } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
};

/** Sesión sin profile, sin membership y sin empleado: el piso de "no tiene nada". */
const mockNoLinks = () => {
  prismaMock.profile.findUnique.mockResolvedValue({ id: 'prof-1', employee_id: null });
  prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'otro-profile' });
  prismaMock.share_company_users.findFirst.mockResolvedValue(null);
  prismaMock.employees.findFirst.mockResolvedValue(null);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUserId).mockResolvedValue('cred-1');
  vi.mocked(getSessionCompanyClaim).mockResolvedValue(null);
  mockNoLinks();
});

describe('canUseAsActiveCompany', () => {
  it('acepta al owner de la empresa (usuario del dashboard)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'prof-1' });
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(true);
  });

  it('acepta al miembro activo de share_company_users (usuario del dashboard)', async () => {
    prismaMock.share_company_users.findFirst.mockResolvedValue({ is_active: true });
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(true);
  });

  it('rechaza al miembro dado de baja', async () => {
    prismaMock.share_company_users.findFirst.mockResolvedValue({ is_active: false });
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(false);
  });

  it('acepta al operario con un empleado de esa empresa, aunque no sea miembro (panel de ropa)', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ id: 'prof-1', employee_id: 'emp-1' });
    prismaMock.employees.findFirst.mockResolvedValue({ id: 'emp-1' });

    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(true);
    expect(prismaMock.employees.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'emp-1', company_id: COMPANY } })
    );
  });

  it('rechaza al operario cuyo empleado es de OTRA empresa', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ id: 'prof-1', employee_id: 'emp-1' });
    prismaMock.employees.findFirst.mockResolvedValue(null); // el empleado no es de COMPANY

    await expect(canUseAsActiveCompany(OTHER_COMPANY)).resolves.toBe(false);
  });

  it('no consulta empleados si el profile no tiene uno vinculado', async () => {
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(false);
    expect(prismaMock.employees.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza sin sesión, sin profile o con un id que no es uuid, sin tocar la base', async () => {
    await expect(canUseAsActiveCompany('no-es-uuid')).resolves.toBe(false);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();

    vi.mocked(getSessionUserId).mockResolvedValue(null);
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(false);
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled();

    vi.mocked(getSessionUserId).mockResolvedValue('cred-1');
    prismaMock.profile.findUnique.mockResolvedValue(null);
    await expect(canUseAsActiveCompany(COMPANY)).resolves.toBe(false);
  });
});

describe('getActiveCompanyId', () => {
  it('prefiere app_metadata.company del JWT y no valida contra la base', async () => {
    vi.mocked(getSessionCompanyClaim).mockResolvedValue('c-jwt');
    mockCookie(COMPANY);

    expect(await getActiveCompanyId()).toBe('c-jwt');
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('cae a la cookie actualComp si el JWT no trae empresa y el usuario tiene vínculo', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'prof-1' });
    mockCookie(COMPANY);

    expect(await getActiveCompanyId()).toBe(COMPANY);
  });

  it('descarta la cookie si el usuario no tiene vínculo con esa empresa (cookie falsificada)', async () => {
    mockCookie(OTHER_COMPANY);

    await expect(getActiveCompanyId()).rejects.toBeInstanceOf(NoActiveCompanyError);
  });

  it('descarta una cookie que no es un uuid', async () => {
    mockCookie('no-es-uuid');

    await expect(getActiveCompanyId()).rejects.toBeInstanceOf(NoActiveCompanyError);
  });

  it('lanza si no hay empresa', async () => {
    mockCookie(undefined);

    await expect(getActiveCompanyId()).rejects.toBeInstanceOf(NoActiveCompanyError);
  });

  it('lanza si la cookie trae el string "undefined"', async () => {
    mockCookie('undefined');

    await expect(getActiveCompanyId()).rejects.toBeInstanceOf(NoActiveCompanyError);
  });
});
