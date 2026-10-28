import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity } from '@/test/db-fixtures';
import { createTestUser, dropTestUsers } from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Límite de empresas por instancia (ticket 807) bajo los roles REALES: `instance_settings` la lee la app
 * (`alphataco_app`) pero no la escribe; el alta de empresa (`createCompany`, con el cliente de sistema y un lock) rechaza
 * al llegar a `max_companies` y deja crear dentro del límite; `getMaxCompanies()` cae en 1 si la fila falta o es inválida.
 *
 * La fila es global: la suite guarda su valor y lo restaura al final. Corre con `scripts/test-rls.sh` (en serie).
 */
const state = vi.hoisted(() => ({
  userId: '7c100000-0000-4000-8000-0000000001aa',
  companyId: '7c100000-0000-4000-8000-00000000000a',
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
  getSessionUser: async () => ({ id: state.userId, email: 'alta@rls-limite.test' }),
  getSessionToken: async () => null,
}));
// Quien da de alta otra empresa ya opera en una (la suya): el request tiene contexto con su usuario.
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => ({ companyId: state.companyId, userId: state.userId, kind: 'user' as const }),
}));

const CUITS = ['30999999014', '30999999022'];
/** Como se guardan (con guiones) o como se escribieron: la limpieza busca las dos formas. */
const STORED_CUITS = [...CUITS, '30-99999901-4', '30-99999902-2'];

let owner: PrismaClient;
let previous: { value: unknown; description: string | null } | null = null;

async function setMax(value: unknown | null, description: string | null = null): Promise<void> {
  if (value === null) {
    await owner.instance_settings.deleteMany({ where: { key: 'max_companies' } });
    return;
  }
  await owner.instance_settings.upsert({
    where: { key: 'max_companies' },
    create: { key: 'max_companies', value: value as never, description },
    update: { value: value as never },
  });
}

function companyForm(cuit: string, city: { id: bigint; province_id: bigint }): FormData {
  const form = new FormData();
  form.set('company_name', `Empresa límite ${cuit}`);
  form.set('company_cuit', cuit);
  form.set('description', 'prueba del límite de empresas');
  form.set('website', '');
  form.set('contact_email', 'limite@rls-limite.test');
  form.set('contact_phone', '+54 (299) 123-4567');
  form.set('address', 'Calle 123');
  form.set('country', 'argentina');
  form.set('industry', 'Petroleo');
  form.set('province_id', String(city.province_id));
  form.set('city', String(city.id));
  return form;
}

async function cleanup(): Promise<void> {
  const companies = await owner.company.findMany({
    where: { company_cuit: { in: STORED_CUITS } },
    select: { id: true },
  });
  const ids = [...companies.map((c) => c.id), state.companyId];
  await owner.user_roles.deleteMany({ where: { company_id: { in: ids } } });
  await owner.share_company_users.deleteMany({ where: { company_id: { in: ids } } });
  await owner.company.deleteMany({ where: { id: { in: ids } } });
  await dropTestUsers(owner, [state.userId]);
}

describe.skipIf(!RUN_RLS)('instance_settings y límite de empresas (roles reales)', () => {
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
    await createTestUser(owner, { id: state.userId, email: 'alta@rls-limite.test', fullname: 'Alta de empresa' });
    await createTestCompany(owner, {
      id: state.companyId,
      name: '__rls_limite__',
      cuit: 'RLS-LIMITE',
      cityId: city.id,
    });
    await owner.share_company_users.create({ data: { company_id: state.companyId, profile_id: state.userId } });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await setMax(null);
    if (previous) await setMax(previous.value, previous.description);
    await owner.$disconnect();
  });

  it('la app lee instance_settings pero no la escribe (ni inserta, ni modifica, ni borra)', async () => {
    await setMax(1);
    const { prismaBase } = await import('@/shared/lib/prisma');
    await expect(prismaBase.instance_settings.findUnique({ where: { key: 'max_companies' } })).resolves.toMatchObject({
      value: 1,
    });
    await expect(
      prismaBase.instance_settings.update({ where: { key: 'max_companies' }, data: { value: 99 } })
    ).rejects.toThrow(/permission denied/);
    await expect(prismaBase.instance_settings.create({ data: { key: 'otra', value: 1 } })).rejects.toThrow(
      /permission denied/
    );
    await expect(prismaBase.instance_settings.deleteMany({ where: { key: 'max_companies' } })).rejects.toThrow(
      /permission denied/
    );
    await expect(owner.instance_settings.findUniqueOrThrow({ where: { key: 'max_companies' } })).resolves.toMatchObject(
      { value: 1 }
    );
  });

  it('getMaxCompanies: el valor guardado, y 1 si la fila falta o el valor no es un entero ≥ 1', async () => {
    const { getMaxCompanies } = await import('./instance-settings');
    await setMax(3);
    await expect(getMaxCompanies()).resolves.toBe(3);
    await setMax('4');
    await expect(getMaxCompanies()).resolves.toBe(4);
    for (const invalid of [0, -2, 1.5, 'muchas', { max: 3 }]) {
      await setMax(invalid);
      await expect(getMaxCompanies()).resolves.toBe(1);
    }
    await setMax(null);
    await expect(getMaxCompanies()).resolves.toBe(1);
  });

  it('createCompany rechaza al llegar al límite y crea dentro del límite', async () => {
    const { createCompany } = await import('@/features/Empresa/General/actions/company.server');
    const existing = await owner.company.count();

    await setMax(existing);
    const rejected = await createCompany(companyForm(CUITS[0]!, city));
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.error).toMatch(/Tu plan permite/);
    await expect(owner.company.count()).resolves.toBe(existing);

    await setMax(existing + 1);
    const created = await createCompany(companyForm(CUITS[0]!, city));
    expect(created.ok).toBe(true);
    await expect(owner.company.count()).resolves.toBe(existing + 1);
    // Con la nueva, el cupo se llenó otra vez.
    const full = await createCompany(companyForm(CUITS[1]!, city));
    expect(full.ok).toBe(false);
    await expect(owner.company.count()).resolves.toBe(existing + 1);
  });
});
