import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import { asContext, employeeContext } from '@/test/hse-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Portal de empleados, fase 1 (ticket 804): acceso del empleado otorgado desde el legajo, bajo el rol REAL de la app
 * (`alphataco_app`), con dos empresas.
 *
 * - `employee_portal_access` y su bitácora: el empleado ve SOLO su fila y no escribe; sin contexto, cero filas.
 * - Habilitar / deshabilitar desde el legajo (la acción con permiso) deja bitácora y corta el acceso en el próximo
 *   request (`getPortalSession`). Sin el permiso en la base, la RLS rechaza la escritura aunque la acción lo omitiera.
 * - Quien solo tiene legajo (sin membresía ni empresa propia) no entra al dashboard: el proxy lo manda al portal. Se
 *   prueba con la consulta REAL del proxy (`prismaSystem`): solo se sustituye la sesión de Better Auth.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({
  ctx: null as TenantContext | null,
  userId: null as string | null,
  /** Sesión que devuelve Better Auth al proxy. */
  authUserId: null as string | null,
}));

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/lib/mail/templates/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/mail/templates/auth')>()),
  sendPortalInvitationEmail: async () => true,
  sendPortalAccessEnabledEmail: async () => true,
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => state.userId,
  isSessionAnonymous: async () => false,
  getSessionNeedsPasswordChange: async () => false,
}));
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => {
    if (!state.ctx) throw new Error('sin empresa activa');
    return state.ctx.companyId;
  },
}));
// El chequeo de la acción se da por bueno: lo que se prueba es que la BASE exige el permiso igual.
vi.mock('@/features/Permissions/actions/permissions.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Permissions/actions/permissions.server')>()),
  checkPermissionServer: async () => true,
}));
vi.mock('@/shared/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () =>
        state.authUserId
          ? {
              user: { id: state.authUserId, isAnonymous: false },
              session: { company: '7b000000-0000-4000-8000-00000000000a', token: 't' },
            }
          : null,
    },
  },
}));

const COMPANY_A = '7b000000-0000-4000-8000-00000000000a';
const COMPANY_B = '7b000000-0000-4000-8000-00000000000b';
const HR_USER = '7b000000-0000-4000-8000-0000000001aa';
const INTRUDER = '7b000000-0000-4000-8000-0000000001ab';
const E1 = '7b000000-0000-4000-8000-0000000002e1';
const E2 = '7b000000-0000-4000-8000-0000000002e2';
const E3 = '7b000000-0000-4000-8000-0000000002e3';
const E1_EMAIL = 'empleado-uno@rls-portal.test';
const E2_EMAIL = 'empleado-dos@rls-portal.test';

const hrCtx: TenantContext = { companyId: COMPANY_A, userId: HR_USER, kind: 'user' };
const intruderCtx: TenantContext = { companyId: COMPANY_A, userId: INTRUDER, kind: 'user' };

let owner: PrismaClient;
const catalog = emptyCatalogRows();
const credentials: Record<string, string> = {};

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  const portalUsers = await owner.user.findMany({
    where: { email: { in: [E1_EMAIL, E2_EMAIL] } },
    select: { id: true },
  });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [HR_USER, INTRUDER, ...portalUsers.map((u) => u.id)]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

const asHr = () => {
  state.ctx = hrCtx;
  state.userId = HR_USER;
};

async function proxyLocation(userId: string | null): Promise<string | null> {
  state.authUserId = userId;
  const { proxy } = await import('@/proxy');
  const response = await proxy(new NextRequest('http://app.test/dashboard'));
  return response.headers.get('location');
}

describe.skipIf(!RUN_RLS)('acceso al portal de empleados bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__rls_portal_A__', cuit: 'RLS-PORTAL-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__rls_portal_B__', cuit: 'RLS-PORTAL-B', cityId: city.id });
    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7501,
      lastname: 'Uno',
      firstname: 'Empleado',
      email: E1_EMAIL,
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7502,
      lastname: 'Dos',
      firstname: 'Empleado',
      email: E2_EMAIL,
    });
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_B,
      seed: 7503,
      lastname: 'Tres',
      firstname: 'Empleado',
    });
    await createTestUser(owner, { id: HR_USER, email: 'rrhh@rls-portal.test', fullname: 'RR.HH.' });
    await createTestUser(owner, { id: INTRUDER, email: 'sinpermiso@rls-portal.test', fullname: 'Sin permiso' });
    await owner.share_company_users.createMany({
      data: [
        { company_id: COMPANY_A, profile_id: HR_USER },
        { company_id: COMPANY_A, profile_id: INTRUDER },
      ],
    });
    await grantPermissions(owner, catalog, {
      userId: HR_USER,
      companyId: COMPANY_A,
      keys: ['empleados:portal_empleado:view', 'empleados:portal_empleado:portal_access'],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  beforeEach(() => {
    state.ctx = null;
    state.userId = null;
    state.authUserId = null;
  });

  it('RR.HH. habilita el portal desde el legajo: cuenta propia del portal, bitácora y contraseña temporal', async () => {
    const { enableEmployeePortalAccess } = await import('./actions.server');
    asHr();
    const first = await enableEmployeePortalAccess({ employeeId: E1, method: 'temporary_password', email: '' });
    expect(first).toMatchObject({ success: true, loginEmail: E1_EMAIL });
    expect(first.success && first.temporaryPassword).toBeTruthy();
    const second = await enableEmployeePortalAccess({ employeeId: E2, method: 'invitation', email: '' });
    expect(second).toMatchObject({ success: true, loginEmail: E2_EMAIL });

    const access = await owner.employee_portal_access.findUniqueOrThrow({
      where: { employee_id: E1 },
      select: {
        status: true,
        method: true,
        created_credential: true,
        credential_id: true,
        granted_by: true,
        company_id: true,
      },
    });
    expect(access).toMatchObject({
      status: 'enabled',
      method: 'temporary_password',
      created_credential: true,
      granted_by: HR_USER,
      company_id: COMPANY_A,
    });
    credentials.E1 = access.credential_id;
    credentials.E2 = (
      await owner.employee_portal_access.findUniqueOrThrow({ where: { employee_id: E2 } })
    ).credential_id;
    await expect(
      owner.profile.findUniqueOrThrow({ where: { id: access.credential_id }, select: { employee_id: true } })
    ).resolves.toEqual({ employee_id: E1 });
    // Sin membresía: el empleado del portal no es usuario del dashboard.
    await expect(owner.share_company_users.count({ where: { profile_id: access.credential_id } })).resolves.toBe(0);
    await expect(
      owner.user.findUniqueOrThrow({ where: { id: access.credential_id }, select: { needsPasswordChange: true } })
    ).resolves.toEqual({ needsPasswordChange: true });

    const events = await owner.employee_portal_access_events.findMany({
      where: { employee_id: E1 },
      select: { action: true, performed_by: true },
    });
    expect(events.map((e) => e.action).sort()).toEqual(['enabled', 'temporary_password_issued']);
    expect(events.every((e) => e.performed_by === HR_USER)).toBe(true);

    // Un legajo de otra empresa no se habilita desde esta.
    await expect(
      enableEmployeePortalAccess({ employeeId: E3, method: 'invitation', email: '' })
    ).resolves.toMatchObject({ success: false });
  });

  it('el empleado ve solo su fila y su bitácora, y no las escribe; sin contexto, cero filas', async () => {
    const ctx = employeeContext(COMPANY_A, E1, credentials.E1!);
    const rows = await asContext(ctx, (tx) => tx.employee_portal_access.findMany({ select: { employee_id: true } }));
    expect(rows).toEqual([{ employee_id: E1 }]);
    const events = await asContext(ctx, (tx) =>
      tx.employee_portal_access_events.findMany({ select: { employee_id: true } })
    );
    expect(events.length).toBe(2);
    expect(events.every((e) => e.employee_id === E1)).toBe(true);

    await expect(
      asContext(ctx, (tx) =>
        tx.employee_portal_access.updateMany({ where: { employee_id: E1 }, data: { status: 'disabled' } })
      )
    ).resolves.toEqual({ count: 0 });
    await expect(
      asContext(ctx, (tx) =>
        tx.employee_portal_access_events.create({
          data: { employee_id: E1, action: 'enabled', performed_by: credentials.E1! },
        })
      )
    ).rejects.toThrow();

    const { prisma } = await import('@/shared/lib/prisma');
    await expect(prisma.employee_portal_access.count({ where: { company_id: COMPANY_A } })).resolves.toBe(0);
    await expect(prisma.employee_portal_access_events.count({ where: { company_id: COMPANY_A } })).resolves.toBe(0);
    // RR.HH. con permiso ve las dos.
    await expect(asContext(hrCtx, (tx) => tx.employee_portal_access.count())).resolves.toBe(2);
  });

  it('el perímetro del portal deja entrar al empleado habilitado con SU credencial', async () => {
    const { getPortalSession } = await import('@/features/Portal/actions/perimeter');
    state.ctx = employeeContext(COMPANY_A, E1, credentials.E1!);
    state.userId = credentials.E1!;
    await expect(getPortalSession()).resolves.toMatchObject({
      ok: true,
      employee: { employeeId: E1, companyId: COMPANY_A },
    });
    // La credencial de otro con el legajo de E1 no entra.
    state.userId = credentials.E2!;
    await expect(getPortalSession()).resolves.toEqual({ ok: false, reason: 'no-access' });
  });

  it('sin el permiso en la base, deshabilitar falla aunque la acción no lo controle (RLS)', async () => {
    const { disableEmployeePortalAccess } = await import('./actions.server');
    state.ctx = intruderCtx;
    state.userId = INTRUDER;
    await expect(disableEmployeePortalAccess(E1)).resolves.toMatchObject({ success: false });
    await expect(
      owner.employee_portal_access.findUniqueOrThrow({ where: { employee_id: E1 }, select: { status: true } })
    ).resolves.toEqual({ status: 'enabled' });
    await expect(
      owner.employee_portal_access_events.count({ where: { employee_id: E1, action: 'disabled' } })
    ).resolves.toBe(0);
  });

  it('deshabilitar deja bitácora, cierra las sesiones de la cuenta del portal y corta el acceso', async () => {
    const now = new Date();
    await owner.session.create({
      data: {
        id: '7b000000-0000-4000-8000-0000000003e1',
        token: 'token-portal-e1',
        userId: credentials.E1!,
        expiresAt: new Date(now.getTime() + 3_600_000),
        createdAt: now,
        updatedAt: now,
      },
    });
    const { disableEmployeePortalAccess } = await import('./actions.server');
    asHr();
    await expect(disableEmployeePortalAccess(E1)).resolves.toMatchObject({ success: true });
    await expect(
      owner.employee_portal_access.findUniqueOrThrow({
        where: { employee_id: E1 },
        select: { status: true, revoked_by: true },
      })
    ).resolves.toEqual({ status: 'disabled', revoked_by: HR_USER });
    await expect(
      owner.employee_portal_access_events.count({ where: { employee_id: E1, action: 'disabled' } })
    ).resolves.toBe(1);
    await expect(owner.session.count({ where: { userId: credentials.E1! } })).resolves.toBe(0);
    // Ya deshabilitado: no se repite.
    await expect(disableEmployeePortalAccess(E1)).resolves.toMatchObject({ success: false });

    const { getPortalSession } = await import('@/features/Portal/actions/perimeter');
    state.ctx = employeeContext(COMPANY_A, E1, credentials.E1!);
    state.userId = credentials.E1!;
    await expect(getPortalSession()).resolves.toEqual({ ok: false, reason: 'no-access' });
  });

  it('el legajo dado de baja no entra aunque el acceso siga habilitado', async () => {
    await owner.employees.update({ where: { id: E2 }, data: { is_active: false } });
    const { getPortalSession } = await import('@/features/Portal/actions/perimeter');
    state.ctx = employeeContext(COMPANY_A, E2, credentials.E2!);
    state.userId = credentials.E2!;
    await expect(getPortalSession()).resolves.toEqual({ ok: false, reason: 'inactive' });
    await owner.employees.update({ where: { id: E2 }, data: { is_active: true } });
  });

  it('proxy: quien solo tiene legajo va al portal; un miembro de la empresa entra al dashboard', async () => {
    await expect(proxyLocation(credentials.E2!)).resolves.toBe('http://app.test/portal');
    await expect(proxyLocation(HR_USER)).resolves.toBeNull();
    // Si además es miembro de una empresa, ya no es «solo empleado».
    await owner.share_company_users.create({ data: { company_id: COMPANY_A, profile_id: credentials.E2! } });
    await expect(proxyLocation(credentials.E2!)).resolves.toBeNull();
    await owner.share_company_users.deleteMany({ where: { profile_id: credentials.E2! } });
  });

  it('con PORTAL_ENABLED=false no se habilita el portal', async () => {
    const { enableEmployeePortalAccess } = await import('./actions.server');
    asHr();
    vi.stubEnv('PORTAL_ENABLED', 'false');
    try {
      await expect(enableEmployeePortalAccess({ employeeId: E1, method: 'invitation', email: '' })).resolves.toEqual({
        success: false,
        error: 'El portal de empleados está apagado en esta instancia.',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
