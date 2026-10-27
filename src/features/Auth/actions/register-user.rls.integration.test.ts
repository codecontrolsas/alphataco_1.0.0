import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity, ensureDefaultRole } from '@/test/db-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Alta de usuario (`registerUserWithRole`) bajo el rol REAL de la app (`alphataco_app`, sin BYPASSRLS). La suite de
 * `register-user.invitation.integration.test.ts` corre como el dueño de las tablas y no veía dos fallas:
 *
 * - Las tablas `auth_*` están cerradas al rol de la app (`20261027140000_rls_remaining_tables`): crear la credencial
 *   con el cliente de la app fallaba con «permission denied» y no se podía invitar a nadie.
 * - `profile_read` solo deja ver perfiles de la empresa activa: un mail que ya era usuario de OTRA empresa no se
 *   encontraba, el alta caía en «crear usuario nuevo» y chocaba con el mail único de `auth_user`.
 *
 * El permiso NO se mockea: el actor recibe `configuracion:usuarios-empleados:create` en la base (la política de
 * `user_roles` lo vuelve a mirar). La suite crea lo que necesita del catálogo de permisos y borra solo lo que creó, así
 * que corre igual sobre una base recién migrada sin seed (CI). Corre con `scripts/test-rls.sh`.
 */
const COMPANY = '7c000000-0000-4000-8000-00000000000a';
const OTHER_COMPANY = '7c000000-0000-4000-8000-00000000000b';
const ACTOR = '7c000000-0000-4000-8000-0000000001aa';
const EXISTING = '7c000000-0000-4000-8000-0000000001bb';
const ROLE_NAME = '__rls_alta_usuario__';
const INVITED_EMAIL = 'invitado-rls@alta.test';
const EXISTING_EMAIL = 'existente-rls@alta.test';

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/utils/cache-invalidation', () => ({ invalidateCacheTags: async () => undefined }));
vi.mock('@/shared/lib/mail/templates/auth', () => ({
  sendInvitationEmail: async () => true,
  sendPasswordResetEmail: async () => true,
}));
// Request con sesión: empresa activa y usuario, como lo resuelve `tenant-db` en la app.
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => ({ companyId: COMPANY, userId: ACTOR, kind: 'user' as const }),
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => ACTOR,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => COMPANY,
  getActiveCompanyIdOrNull: async () => COMPANY,
}));

let owner: PrismaClient;
/** Filas del catálogo de permisos que creó la suite (si ya existían, no se tocan). */
const created = { moduleId: null as string | null, tabId: null as string | null, actionId: null as string | null };

/** `configuracion:usuarios-empleados:create` concedido al actor en COMPANY, creando lo que falte del catálogo. */
async function grantCreateUsersPermission(): Promise<void> {
  let module = await owner.modules.findUnique({ where: { slug: 'configuracion' }, select: { id: true } });
  if (!module) {
    module = await owner.modules.create({
      data: { slug: 'configuracion', name: 'Configuración', price: 0, description: 'Prueba RLS' },
      select: { id: true },
    });
    created.moduleId = module.id;
  }
  let tab = await owner.tabs.findFirst({
    where: { module_id: module.id, slug: 'usuarios-empleados' },
    select: { id: true },
  });
  if (!tab) {
    tab = await owner.tabs.create({
      data: { module_id: module.id, slug: 'usuarios-empleados', name: 'Usuarios' },
      select: { id: true },
    });
    created.tabId = tab.id;
  }
  let action = await owner.actions.findUnique({ where: { slug: 'create' }, select: { id: true } });
  if (!action) {
    action = await owner.actions.create({ data: { slug: 'create', name: 'Crear' }, select: { id: true } });
    created.actionId = action.id;
  }
  await owner.user_permissions.create({
    data: { user_id: ACTOR, tab_id: tab.id, action_id: action.id, company_id: COMPANY, is_granted: true },
  });
}

async function createUser(id: string, email: string, fullname: string): Promise<void> {
  const now = new Date();
  await owner.user.create({
    data: { id, name: fullname, email, emailVerified: true, createdAt: now, updatedAt: now },
  });
  await owner.profile.create({ data: { id, credential_id: id, email, fullname } });
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY, OTHER_COMPANY];
  const invited = await owner.user.findUnique({ where: { email: INVITED_EMAIL }, select: { id: true } });
  const userIds = [ACTOR, EXISTING, ...(invited ? [invited.id] : [])];
  await owner.user_roles.deleteMany({ where: { company_id: { in: companies } } });
  await owner.user_permissions.deleteMany({ where: { company_id: { in: companies } } });
  await owner.share_company_users.deleteMany({ where: { company_id: { in: companies } } });
  await owner.profile.deleteMany({ where: { id: { in: userIds } } });
  await owner.user.deleteMany({ where: { id: { in: userIds } } });
  await owner.company.deleteMany({ where: { id: { in: companies } } });
  await owner.roles.deleteMany({ where: { name: ROLE_NAME } });
}

describe.skipIf(!RUN_RLS)('registerUserWithRole bajo RLS (rol alphataco_app)', () => {
  let roleId: bigint;

  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    await ensureDefaultRole(owner);
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY, name: '__rls_alta__', cuit: 'RLS-ALTA', cityId: city.id });
    await createTestCompany(owner, {
      id: OTHER_COMPANY,
      name: '__rls_alta_otra__',
      cuit: 'RLS-ALTA-2',
      cityId: city.id,
    });
    roleId = (await owner.roles.create({ data: { name: ROLE_NAME, is_active: true }, select: { id: true } })).id;

    await createUser(ACTOR, 'actor-rls@alta.test', 'Quien invita');
    await owner.share_company_users.create({ data: { company_id: COMPANY, profile_id: ACTOR } });
    await grantCreateUsersPermission();

    // Usuario que ya es miembro de OTRA empresa: el actor no lo ve por `profile_read`.
    await createUser(EXISTING, EXISTING_EMAIL, 'Ya existe');
    await owner.share_company_users.create({ data: { company_id: OTHER_COMPANY, profile_id: EXISTING } });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    if (created.actionId) await owner.actions.delete({ where: { id: created.actionId } });
    if (created.tabId) await owner.tabs.delete({ where: { id: created.tabId } });
    if (created.moduleId) await owner.modules.delete({ where: { id: created.moduleId } });
    await owner.$disconnect();
  });

  it('invita a un mail nuevo: credencial, perfil, pertenencia y rol', async () => {
    const { registerUserWithRole } = await import('./register-user');
    const result = await registerUserWithRole({
      email: INVITED_EMAIL,
      firstname: 'Ana',
      lastname: 'Invitada',
      role: String(roleId),
    } as never);
    expect(result).toEqual({ success: true, message: 'Usuario creado exitosamente' });

    const user = await owner.user.findUniqueOrThrow({ where: { email: INVITED_EMAIL } });
    expect(await owner.profile.count({ where: { id: user.id, credential_id: user.id } })).toBe(1);
    expect(await owner.share_company_users.count({ where: { profile_id: user.id, company_id: COMPANY } })).toBe(1);
    expect(await owner.user_roles.count({ where: { user_id: user.id, company_id: COMPANY, role_id: roleId } })).toBe(1);
  });

  it('suma a la empresa a un usuario que ya existe en otra, sin crear otra credencial', async () => {
    const { registerUserWithRole } = await import('./register-user');
    const result = await registerUserWithRole({
      email: EXISTING_EMAIL,
      firstname: 'Ya',
      lastname: 'Existe',
      role: String(roleId),
    } as never);
    expect(result).toEqual({ success: true, message: 'Usuario creado exitosamente' });

    expect(await owner.user.count({ where: { email: EXISTING_EMAIL } })).toBe(1);
    expect(await owner.share_company_users.count({ where: { profile_id: EXISTING, company_id: COMPANY } })).toBe(1);
    expect(await owner.user_roles.count({ where: { user_id: EXISTING, company_id: COMPANY, role_id: roleId } })).toBe(
      1
    );
  });
});
