import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: vi.fn(),
  getSessionCompanyClaim: vi.fn(async () => null),
}));

const prismaMock = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  share_company_users: { findFirst: vi.fn() },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock, prismaBase: prismaMock }));

import { getSessionUserId } from '@/shared/lib/session';
import { assertCompanyAccess, NoActiveCompanyError } from './tenant';

const COMPANY = '2f1e0b4c-1d8a-4a2f-9b6f-0f0a1b2c3d4e';

describe('assertCompanyAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('cred-1');
    prismaMock.profile.findUnique.mockResolvedValue({ id: 'prof-1' });
  });

  it('pasa si el profile es owner de la empresa', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'prof-1' });
    prismaMock.share_company_users.findFirst.mockResolvedValue(null);
    await expect(assertCompanyAccess(COMPANY)).resolves.toBeUndefined();
    expect(prismaMock.company.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMPANY } })
    );
  });

  it('pasa si el profile es miembro activo (share_company_users)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'otro' });
    prismaMock.share_company_users.findFirst.mockResolvedValue({ is_active: true });
    await expect(assertCompanyAccess(COMPANY)).resolves.toBeUndefined();
    expect(prismaMock.share_company_users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profile_id: 'prof-1', company_id: COMPANY } })
    );
  });

  it('lanza si no hay relación con la empresa (ni owner ni miembro activo)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ owner_id: 'otro' });
    prismaMock.share_company_users.findFirst.mockResolvedValue({ is_active: false });
    await expect(assertCompanyAccess(COMPANY)).rejects.toThrow('Sin acceso a la empresa');
  });

  it('lanza si no hay sesión, sin consultar la empresa', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    await expect(assertCompanyAccess(COMPANY)).rejects.toBeInstanceOf(NoActiveCompanyError);
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled();
  });

  it('lanza si la sesión no tiene profile o el companyId no es uuid', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    await expect(assertCompanyAccess(COMPANY)).rejects.toThrow('Sin acceso a la empresa');
    await expect(assertCompanyAccess('not-a-uuid')).rejects.toThrow('Sin acceso a la empresa');
  });
});
