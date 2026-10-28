import { describe, expect, it, vi } from 'vitest';

/**
 * Perímetro (sin RLS) de las lecturas por id arbitrario de `roles.server.ts`:
 * `getUserPermissionsForUserServer`/`getUserRolesServer` (propio dato o permiso
 * `detalle-usuario:view`) y `getRolePermissionsServer` (permiso `gestion-roles:view`).
 * Mockea sesión + `checkPermissionServer` + Prisma — no toca la BD real.
 */
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    role_permissions: { findMany: vi.fn(async () => []) },
    user_roles: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: vi.fn() }));
vi.mock('@/shared/lib/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('./permissions.server', () => ({ checkPermissionServer: vi.fn() }));
vi.mock('@/shared/lib/sql', () => ({ callFunction: vi.fn(async () => []) }));
// F3: el editor de roles filtra las pestañas de módulos apagados; acá no hay ninguno.
vi.mock('@/features/Modules/server/modules.server', () => ({
  getDisabledTabIds: vi.fn(async () => new Set<string>()),
}));

import { getSessionUserId } from '@/shared/lib/session';
import { checkPermissionServer } from './permissions.server';
import { getRolePermissionsServer, getUserPermissionsForUserServer, getUserRolesServer } from './roles.server';

const sessionUserIdMock = vi.mocked(getSessionUserId);
const checkPermissionServerMock = vi.mocked(checkPermissionServer);

describe('getUserPermissionsForUserServer / getUserRolesServer — perímetro', () => {
  it('permite leer el propio dato (sessionUserId === userId) sin consultar checkPermissionServer', async () => {
    sessionUserIdMock.mockResolvedValue('u1');

    await expect(getUserPermissionsForUserServer('u1')).resolves.toEqual([]);
    await expect(getUserRolesServer('u1')).resolves.toEqual([]);

    expect(checkPermissionServerMock).not.toHaveBeenCalled();
  });

  it('permite leer el dato de otro usuario si tiene permiso detalle-usuario:view', async () => {
    sessionUserIdMock.mockResolvedValue('u1');
    checkPermissionServerMock.mockResolvedValue(true);

    await expect(getUserPermissionsForUserServer('u2')).resolves.toEqual([]);
    await expect(getUserRolesServer('u2')).resolves.toEqual([]);

    expect(checkPermissionServerMock).toHaveBeenCalledWith('configuracion', 'detalle-usuario', 'view');
  });

  it('lanza sin permiso ni dato propio (fail-closed, sin datos)', async () => {
    sessionUserIdMock.mockResolvedValue('u1');
    checkPermissionServerMock.mockResolvedValue(false);

    await expect(getUserPermissionsForUserServer('u2')).rejects.toThrow('Sin permiso');
    await expect(getUserRolesServer('u2')).rejects.toThrow('Sin permiso');
  });

  it('lanza sin sesión (sessionUserId null) salvo permiso explícito', async () => {
    sessionUserIdMock.mockResolvedValue(null);
    checkPermissionServerMock.mockResolvedValue(false);

    await expect(getUserPermissionsForUserServer('u2')).rejects.toThrow('Sin permiso');
  });
});

describe('getRolePermissionsServer — perímetro', () => {
  it('permite leer con permiso gestion-roles:view', async () => {
    checkPermissionServerMock.mockResolvedValue(true);

    await expect(getRolePermissionsServer(1)).resolves.toEqual([]);

    expect(checkPermissionServerMock).toHaveBeenCalledWith('configuracion', 'gestion-roles', 'view');
  });

  it('lanza sin permiso gestion-roles:view (fail-closed, sin datos)', async () => {
    checkPermissionServerMock.mockResolvedValue(false);

    await expect(getRolePermissionsServer(1)).rejects.toThrow('Sin permiso');
  });
});
