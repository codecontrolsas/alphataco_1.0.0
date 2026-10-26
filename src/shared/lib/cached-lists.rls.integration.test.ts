import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity, ensureDefaultRole } from '@/test/db-fixtures';
import {
  RUN_RLS,
  assertAppRoleConnection,
  connectAsAppRoles,
  createTestCompany,
  createTestMember,
} from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Listas cacheadas (`'use cache'`) bajo el rol REAL de la app: Configuración → Usuarios, Mantenimiento → Taller y la
 * Bandeja de Aprobaciones (órdenes a validar).
 *
 * Simula lo que ve una función cacheada en Next: NO hay request, así que el resolver del cliente `prisma` no encuentra
 * contexto (`getTenantContextOrNull` → null). Con la empresa recibida por parámetro y `runInCompanyScope`, cada lista
 * devuelve las filas de su empresa y ninguna de la otra; sin eso (antes del arreglo) la RLS devolvía cero filas.
 * Los permisos y la empresa activa se simulan: lo que se prueba es la consulta, no la sesión.
 *
 * Corre con `scripts/test-rls.sh` (habilita los roles y exporta las URLs).
 */
const state = vi.hoisted(() => ({ activeCompany: '' }));

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
// Dentro del cache no hay request: el cliente `prisma` no tiene de dónde sacar la empresa.
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => null,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => state.activeCompany,
  assertCompanyAccess: async () => undefined,
}));
vi.mock('@/features/Permissions/actions/permissions.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Permissions/actions/permissions.server')>()),
  checkPermissionServer: async () => true,
}));
vi.mock('@/features/Mantenimiento/utils/equipmentTypeVisibility', () => ({
  getHiddenEquipmentTypeIds: async () => [],
}));

const COMPANY_A = '7a000000-0000-4000-8000-00000000000a';
const COMPANY_B = '7a000000-0000-4000-8000-00000000000b';
const USER_A = '7a000000-0000-4000-8000-0000000001aa';
const USER_B = '7a000000-0000-4000-8000-0000000001bb';
const EMAIL_A = 'usuario-a@rls-listas.test';
const EMAIL_B = 'usuario-b@rls-listas.test';
const WORKSHOP_ORDER = { A: '7a000000-0000-4000-8000-0000000002aa', B: '7a000000-0000-4000-8000-0000000002bb' };
const VALIDATION_ORDER = { A: '7a000000-0000-4000-8000-0000000003aa', B: '7a000000-0000-4000-8000-0000000003bb' };

let owner: PrismaClient;

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.maintenance_orders.deleteMany({ where: { company_id: { in: companies } } });
  await owner.share_company_users.deleteMany({ where: { company_id: { in: companies } } });
  await owner.profile.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

describe.skipIf(!RUN_RLS)('listas cacheadas bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    await ensureDefaultRole(owner);
    const city = await ensureCity(owner);

    for (const [companyId, label] of [
      [COMPANY_A, 'A'],
      [COMPANY_B, 'B'],
    ] as const) {
      await createTestCompany(owner, {
        id: companyId,
        name: `__rls_listas_${label}__`,
        cuit: `RLS-LISTAS-${label}`,
        cityId: city.id,
      });
      await createTestMember(owner, {
        id: label === 'A' ? USER_A : USER_B,
        email: label === 'A' ? EMAIL_A : EMAIL_B,
        fullname: `Usuario ${label}`,
        companyId,
      });
      await owner.maintenance_orders.createMany({
        data: [
          { id: WORKSHOP_ORDER[label], company_id: companyId, status: 'in_workshop', order_number: `RLS-T-${label}` },
          {
            id: VALIDATION_ORDER[label],
            company_id: companyId,
            status: 'pending_workshop_validation',
            order_number: `RLS-V-${label}`,
          },
        ],
      });
    }
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
  });

  it('control: sin contexto el rol de la app no ve filas (la RLS está activa)', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const companies = [COMPANY_A, COMPANY_B];

    await expect(prisma.share_company_users.count({ where: { company_id: { in: companies } } })).resolves.toBe(0);
    await expect(prisma.maintenance_orders.count({ where: { company_id: { in: companies } } })).resolves.toBe(0);
    // El dueño sí: los datos existen.
    await expect(owner.maintenance_orders.count({ where: { company_id: { in: companies } } })).resolves.toBe(4);
  });

  it('con una empresa fijada, el rol de la app ve solo esa empresa (ni una fila de la otra)', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const { runInCompanyScope } = await import('@/shared/lib/tenant-context');

    const ids = await runInCompanyScope(COMPANY_A, () =>
      prisma.maintenance_orders.findMany({
        where: { company_id: { in: [COMPANY_A, COMPANY_B] } },
        select: { id: true },
      })
    );
    expect(ids.map((o) => o.id).sort()).toEqual([WORKSHOP_ORDER.A, VALIDATION_ORDER.A].sort());
  });

  it.each([
    ['A', COMPANY_A, EMAIL_A, EMAIL_B],
    ['B', COMPANY_B, EMAIL_B, EMAIL_A],
  ] as const)(
    'Configuración → Usuarios de la empresa %s: lista, export y facetas',
    async (_l, companyId, own, other) => {
      const { getCompanyUsersPaginated, getAllCompanyUsersForExport } = await import(
        '@/features/Empresa/Usuarios/actions.server'
      );
      const { getCompanyUserSingleFacet } = await import('@/features/Empresa/Usuarios/facets.server');

      const page = await getCompanyUsersPaginated(companyId, {});
      const emails = page.data.map((row) => row.profile?.email);
      expect(emails).toContain(own);
      expect(emails).not.toContain(other);
      expect(page.total).toBe(1);

      const exported = await getAllCompanyUsersForExport(companyId, {});
      expect(exported.ok && exported.data.map((row) => row.profile?.email)).toEqual([own]);

      const facet = await getCompanyUserSingleFacet('is_active', companyId, {});
      expect(facet?.counts.get('true')).toBe(1);
    }
  );

  it.each([
    ['A', COMPANY_A, 'A', 'B'],
    ['B', COMPANY_B, 'B', 'A'],
  ] as const)('Mantenimiento → Taller de la empresa %s', async (_l, companyId, own, other) => {
    state.activeCompany = companyId;
    const { getMaintenanceOrdersPaginated } = await import(
      '@/features/Mantenimiento/MaintenanceOrders/table/actions.server'
    );

    const page = await getMaintenanceOrdersPaginated({});
    const ids = page.data.map((order) => order.id);
    expect(ids).toEqual([WORKSHOP_ORDER[own]]);
    expect(ids).not.toContain(WORKSHOP_ORDER[other]);
    expect(page.total).toBe(1);
  });

  it.each([
    ['A', COMPANY_A, 'A', 'B'],
    ['B', COMPANY_B, 'B', 'A'],
  ] as const)('Bandeja de Aprobaciones (órdenes a validar) de la empresa %s', async (_l, companyId, own, other) => {
    state.activeCompany = companyId;
    const { getOrdersPendingValidation } = await import('@/features/Mantenimiento/ApprovalInbox/actions/actionsServer');

    const ids = (await getOrdersPendingValidation()).map((order) => order.id);
    expect(ids).toEqual([VALIDATION_ORDER[own]]);
    expect(ids).not.toContain(VALIDATION_ORDER[other]);
  });
});
