import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity } from '@/test/db-fixtures';
import { createTestUser, dropTestUsers } from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Usuario autenticado SIN empresa activa bajo el rol REAL de la app (`alphataco_app`, sin BYPASSRLS): el que el proxy
 * manda a `/dashboard/configuration/companies/new` en su primer ingreso, o el que tiene membresías y todavía no eligió
 * ninguna. `tenant-db` NO se simula: el contexto lo resuelve el cliente `prisma` como en un request real.
 *
 * Sin empresa activa no se fijaba `app.user_id`, la política `profile_read` le ocultaba su propio perfil y
 * `createCompany` respondía «El usuario de sesión no tiene perfil». Ahora se fija solo el actor: ve lo suyo (perfil,
 * membresías, empresas a las que pertenece) y nada ajeno ni de negocio.
 *
 * `max_companies` es global: la suite guarda su valor y lo restaura. Corre con `scripts/test-rls.sh` (en serie).
 */
const state = vi.hoisted(() => ({
  userId: '',
  activeCompanyId: null as string | null,
  sessionToken: null as string | null,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  cacheLife: () => undefined,
  cacheTag: () => undefined,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => state.userId,
  getSessionUser: async () => ({ id: state.userId, email: `${state.userId}@rls-primera.test` }),
  getSessionCompanyClaim: async () => state.activeCompanyId,
  getSessionToken: async () => state.sessionToken,
  isSessionAnonymous: async () => false,
}));
// La empresa activa sale de la sesión: mientras no haya, `getActiveCompanyId()` lanza como en la app.
vi.mock('@/shared/lib/tenant', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/lib/tenant')>();
  return {
    ...original,
    getActiveCompanyId: async () => {
      if (!state.activeCompanyId) throw new original.NoActiveCompanyError();
      return state.activeCompanyId;
    },
    setActiveCompanyCookie: async () => undefined,
  };
});

const NEW_USER = '7d100000-0000-4000-8000-0000000001aa';
const MEMBER_USER = '7d100000-0000-4000-8000-0000000001bb';
const STRANGER = '7d100000-0000-4000-8000-0000000001cc';
const OTHER_COMPANY = '7d100000-0000-4000-8000-00000000000a';
const OTHER_CUIT = '30999999057';
const CUITS = ['30999999030', '30999999049'];
/** Como se guardan (con guiones) o como se escribieron: la limpieza busca las dos formas. */
const STORED_CUITS = [...CUITS, '30-99999903-0', '30-99999904-9'];
const SESSION_TOKEN = 'rls-primera-empresa-token';

let owner: PrismaClient;
let previous: { value: unknown; description: string | null } | null = null;

async function setMax(value: number | null): Promise<void> {
  if (value === null) {
    await owner.instance_settings.deleteMany({ where: { key: 'max_companies' } });
    return;
  }
  await owner.instance_settings.upsert({
    where: { key: 'max_companies' },
    create: { key: 'max_companies', value },
    update: { value },
  });
}

function companyForm(cuit: string, city: { id: bigint; province_id: bigint }): FormData {
  const form = new FormData();
  form.set('company_name', `Primera empresa ${cuit}`);
  form.set('company_cuit', cuit);
  form.set('description', 'prueba del alta de la primera empresa');
  form.set('website', '');
  form.set('contact_email', 'primera@rls-primera.test');
  form.set('contact_phone', '+54 (299) 123-4567');
  form.set('address', 'Calle 123');
  form.set('country', 'argentina');
  form.set('industry', 'Petroleo');
  form.set('province_id', String(city.province_id));
  form.set('city', String(city.id));
  return form;
}

function asUser(userId: string): void {
  state.userId = userId;
  state.activeCompanyId = null;
  state.sessionToken = null;
}

async function cleanup(): Promise<void> {
  const companies = await owner.company.findMany({
    where: { company_cuit: { in: STORED_CUITS } },
    select: { id: true },
  });
  const ids = [...companies.map((c) => c.id), OTHER_COMPANY];
  await owner.user_roles.deleteMany({ where: { company_id: { in: ids } } });
  await owner.share_company_users.deleteMany({ where: { company_id: { in: ids } } });
  await owner.employees.deleteMany({ where: { company_id: OTHER_COMPANY } });
  await owner.company.deleteMany({ where: { id: { in: ids } } });
  await dropTestUsers(owner, [NEW_USER, MEMBER_USER, STRANGER]);
}

describe.skipIf(!RUN_RLS)('usuario sin empresa activa (rol alphataco_app)', () => {
  let city: { id: bigint; province_id: bigint };

  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    previous = await owner.instance_settings.findUnique({
      where: { key: 'max_companies' },
      select: { value: true, description: true },
    });
    city = await ensureCity(owner);
    for (const [id, name] of [
      [NEW_USER, 'Usuario nuevo'],
      [MEMBER_USER, 'Miembro sin empresa activa'],
      [STRANGER, 'Usuario de otra empresa'],
    ] as const) {
      await createTestUser(owner, { id, email: `${id}@rls-primera.test`, fullname: name });
    }
    await createTestCompany(owner, {
      id: OTHER_COMPANY,
      name: '__rls_primera_otra__',
      cuit: OTHER_CUIT,
      cityId: city.id,
    });
    await owner.share_company_users.createMany({
      data: [
        { company_id: OTHER_COMPANY, profile_id: MEMBER_USER },
        { company_id: OTHER_COMPANY, profile_id: STRANGER },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await setMax(null);
    if (previous) {
      await owner.instance_settings.create({
        data: { key: 'max_companies', value: previous.value as never, description: previous.description },
      });
    }
    await owner.$disconnect();
  });

  it('ve su propio perfil y nada ajeno: ni perfiles, ni empresas, ni membresías, ni datos de negocio', async () => {
    asUser(NEW_USER);
    const { prisma } = await import('@/shared/lib/prisma');
    const { getCurrentUserProfile } = await import('@/features/Layout/sidebar/actions/user-profile');
    const { hasAnyCompanyMembership } = await import('@/features/Empresa/General/actions/company.server');

    await expect(getCurrentUserProfile()).resolves.toMatchObject({ id: NEW_USER });
    await expect(hasAnyCompanyMembership()).resolves.toBe(false);

    const profiles = await prisma.profile.findMany({
      where: { id: { in: [NEW_USER, MEMBER_USER, STRANGER] } },
      select: { id: true },
    });
    expect(profiles.map((p) => p.id)).toEqual([NEW_USER]);
    await expect(prisma.company.findMany({ where: { id: OTHER_COMPANY } })).resolves.toEqual([]);
    await expect(prisma.share_company_users.count({ where: { company_id: OTHER_COMPANY } })).resolves.toBe(0);
    // Sin empresa activa no se escribe nada de negocio: sumarse a una empresa ajena lo rechaza la política.
    await expect(
      prisma.share_company_users.create({ data: { company_id: OTHER_COMPANY, profile_id: NEW_USER } })
    ).rejects.toThrow(/row-level security/);
  });

  it('crea su primera empresa (queda dueño, miembro, admin y con empresa activa) y la segunda la rechaza el límite', async () => {
    asUser(NEW_USER);
    const { createCompany, getCompanyName, hasAnyCompanyMembership } = await import(
      '@/features/Empresa/General/actions/company.server'
    );
    const { prisma } = await import('@/shared/lib/prisma');
    await owner.session.create({
      data: {
        id: '7d100000-0000-4000-8000-0000000005aa',
        token: SESSION_TOKEN,
        userId: NEW_USER,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    state.sessionToken = SESSION_TOKEN;

    // Límite por defecto de una instancia: lugar para una sola empresa más.
    await setMax((await owner.company.count()) + 1);

    // El CUIT es único en toda la instancia: el de una empresa ajena (que la RLS no le deja ver) se informa en el campo.
    const duplicated = await createCompany(companyForm(OTHER_CUIT, city));
    expect(duplicated).toMatchObject({ ok: false, fieldErrors: { company_cuit: expect.stringMatching(/CUIT/) } });

    const created = await createCompany(companyForm(CUITS[0]!, city));
    expect(created).toMatchObject({ ok: true });
    const companyId = created.ok ? created.data.id : '';

    await expect(owner.company.findUnique({ where: { id: companyId }, select: { owner_id: true } })).resolves.toEqual({
      owner_id: NEW_USER,
    });
    await expect(
      owner.share_company_users.count({ where: { company_id: companyId, profile_id: NEW_USER, is_active: true } })
    ).resolves.toBe(1);
    const adminRole = await owner.roles.findFirst({ where: { slug: 'admin', is_system: true }, select: { id: true } });
    if (adminRole) {
      await expect(
        owner.user_roles.count({ where: { user_id: NEW_USER, company_id: companyId, role_id: adminRole.id } })
      ).resolves.toBe(1);
    }
    // La empresa nueva queda como activa de la sesión (el proxy deja pasar al dashboard).
    await expect(
      owner.session.findUnique({ where: { token: SESSION_TOKEN }, select: { company: true } })
    ).resolves.toEqual({ company: companyId });

    // Todavía sin empresa activa en este request: ya la ve como propia.
    await expect(hasAnyCompanyMembership()).resolves.toBe(true);
    await expect(prisma.company.count({ where: { id: companyId } })).resolves.toBe(1);

    // Con la empresa activa (el request siguiente) navega como dueño.
    state.activeCompanyId = companyId;
    await expect(getCompanyName()).resolves.toEqual({ company_name: `Primera empresa ${CUITS[0]}` });

    const rejected = await createCompany(companyForm(CUITS[1]!, city));
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.error).toMatch(/Tu plan permite/);
    await expect(owner.company.count({ where: { company_cuit: { in: STORED_CUITS } } })).resolves.toBe(1);
  });

  it('con membresías y ninguna activa lista sus empresas y elige una suya, no una ajena', async () => {
    asUser(MEMBER_USER);
    const { prisma } = await import('@/shared/lib/prisma');
    const { fetchUserCompanies } = await import('@/shared/actions/company.actions');
    const { switchActiveCompany } = await import('@/shared/actions/company-user.actions');
    const { hasAnyCompanyMembership } = await import('@/features/Empresa/General/actions/company.server');

    await expect(hasAnyCompanyMembership()).resolves.toBe(true);
    const { sharedCompanies, allCompanies } = await fetchUserCompanies();
    const listed = [...sharedCompanies, ...allCompanies].map((c) => ('id' in c ? c.id : null));
    expect(listed).toContain(OTHER_COMPANY);

    // Ve la empresa y su membresía, pero no a los demás miembros hasta que la elija.
    await expect(prisma.company.findMany({ where: { id: OTHER_COMPANY }, select: { id: true } })).resolves.toEqual([
      { id: OTHER_COMPANY },
    ]);
    const memberships = await prisma.share_company_users.findMany({
      where: { company_id: OTHER_COMPANY },
      select: { profile_id: true },
    });
    expect(memberships).toEqual([{ profile_id: MEMBER_USER }]);
    await expect(prisma.profile.findUnique({ where: { id: STRANGER }, select: { id: true } })).resolves.toBeNull();

    const foreign = await owner.company.findFirstOrThrow({
      where: { company_cuit: { in: STORED_CUITS } },
      select: { id: true },
    });
    await expect(switchActiveCompany(foreign.id)).resolves.toMatchObject({ ok: false });

    await owner.session.create({
      data: {
        id: '7d100000-0000-4000-8000-0000000005bb',
        token: `${SESSION_TOKEN}-miembro`,
        userId: MEMBER_USER,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    state.sessionToken = `${SESSION_TOKEN}-miembro`;
    await expect(switchActiveCompany(OTHER_COMPANY)).resolves.toEqual({ ok: true });
    await expect(
      owner.session.findUnique({ where: { token: `${SESSION_TOKEN}-miembro` }, select: { company: true } })
    ).resolves.toEqual({ company: OTHER_COMPANY });
  });
});
