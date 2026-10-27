import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity } from '@/test/db-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Flujos de un usuario logueado bajo el rol REAL de la app (`alphataco_app`, sin BYPASSRLS): el contexto de la
 * transacción lo resuelve el cliente `prisma` como en un request (empresa activa + usuario), así que lo que decide es
 * la política de la base.
 *
 * - Preferencias de tabla: la clave es `<usuario>:<tabla>` y la política comparaba la clave entera con el usuario;
 *   cada guardado violaba la RLS (el error se loguea y se traga) y nunca se guardaba nada.
 * - Tipo de reparación «Diagnóstico»: el tipo oculto que crea cada OT (ticket 800) hacía chocar el control de nombre
 *   repetido y no se podía crear uno propio con ese nombre.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const COMPANY = '7b000000-0000-4000-8000-00000000000a';
const USER = '7b000000-0000-4000-8000-0000000001aa';
const OTHER_USER = '7b000000-0000-4000-8000-0000000001bb';
const TABLE = '__rls_preferencias__';

const session = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
// Request con sesión: empresa activa y usuario, como lo resuelve `tenant-db` en la app.
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => ({ companyId: COMPANY, userId: session.userId, kind: 'user' as const }),
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => session.userId,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => COMPANY,
}));
vi.mock('@/features/Permissions/actions/permissions.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Permissions/actions/permissions.server')>()),
  checkPermissionServer: async () => true,
}));

let owner: PrismaClient;

async function cleanup(): Promise<void> {
  await owner.user_table_preferences.deleteMany({
    where: { user_id: { in: [`${USER}:${TABLE}`, `${OTHER_USER}:${TABLE}`] } },
  });
  await owner.types_of_repairs.deleteMany({ where: { company_id: COMPANY } });
  await owner.company.deleteMany({ where: { id: COMPANY } });
}

describe.skipIf(!RUN_RLS)('flujos de usuario bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY, name: '__rls_flujos__', cuit: 'RLS-FLUJOS', cityId: city.id });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
  });

  describe('preferencias de tabla', () => {
    it('se guardan y se leen con el rol de la app', async () => {
      session.userId = USER;
      const { getTablePreferences, saveTableColumnVisibility, saveTableViewPreferences } = await import(
        '@/shared/actions/table-preferences'
      );

      await saveTableColumnVisibility(TABLE, { email: false });
      await saveTableViewPreferences(TABLE, { pageSize: 50, sorting: [{ id: 'name', desc: true }] });

      await expect(getTablePreferences(TABLE)).resolves.toEqual({
        columnVisibility: { email: false },
        pageSize: 50,
        sorting: [{ id: 'name', desc: true }],
      });
      // Quedó en la base con la clave de siempre (no se cambia el formato: hay filas guardadas así).
      const stored = await owner.user_table_preferences.findUnique({ where: { user_id: `${USER}:${TABLE}` } });
      expect(stored?.preferences).toMatchObject({ pageSize: 50 });

      // Modificar una fila existente actualiza `updated_at` (el upsert dejaba la fecha del alta).
      const old = new Date('2000-01-01T00:00:00Z');
      await owner.user_table_preferences.update({ where: { user_id: `${USER}:${TABLE}` }, data: { updated_at: old } });
      await saveTableColumnVisibility(TABLE, { email: true });
      const updated = await owner.user_table_preferences.findUnique({ where: { user_id: `${USER}:${TABLE}` } });
      expect(updated?.updated_at.getTime()).toBeGreaterThan(old.getTime());
      await saveTableColumnVisibility(TABLE, { email: false });
    });

    it('otro usuario no ve ni pisa las preferencias ajenas', async () => {
      session.userId = OTHER_USER;
      const { getTablePreferences, saveTableColumnVisibility } = await import('@/shared/actions/table-preferences');
      const { prisma } = await import('@/shared/lib/prisma');

      await expect(getTablePreferences(TABLE)).resolves.toEqual({});
      await expect(prisma.user_table_preferences.count({ where: { user_id: `${USER}:${TABLE}` } })).resolves.toBe(0);
      // Escribir una clave de otro usuario la rechaza la política.
      await expect(
        prisma.user_table_preferences.create({ data: { user_id: `${USER}:otra`, preferences: {} } })
      ).rejects.toThrow();

      await saveTableColumnVisibility(TABLE, { name: false });
      await expect(getTablePreferences(TABLE)).resolves.toEqual({ columnVisibility: { name: false } });
      const original = await owner.user_table_preferences.findUnique({ where: { user_id: `${USER}:${TABLE}` } });
      expect(original?.preferences).toMatchObject({ columnVisibility: { email: false } });
    });
  });

  describe('tipo de reparación «Diagnóstico»', () => {
    it('se puede crear uno propio aunque exista el tipo oculto de las OT, y el oculto no se lista', async () => {
      session.userId = USER;
      const { prisma } = await import('@/shared/lib/prisma');
      const { ensureDiagnosticRepairType, getDiagnosticRepairTypeId } = await import(
        '@/features/Mantenimiento/utils/diagnostic-repair-type'
      );
      const { createTypeOfRepair, fetchAllTypesOfRepairs, updateTypeOfRepair, deleteTypeOfRepair } = await import(
        '@/features/Mantenimiento/TiposReparaciones/actions/actions'
      );

      // Lo que hace generar una OT: crea el tipo oculto de la empresa.
      const hiddenId = await prisma.$transaction((tx) => ensureDiagnosticRepairType(tx, COMPANY));
      expect(hiddenId).toBe(getDiagnosticRepairTypeId(COMPANY));

      const created = await createTypeOfRepair({ name: 'Diagnóstico', description: 'Revisión general del equipo' });
      expect(created).toMatchObject({ ok: true });

      const listed = await fetchAllTypesOfRepairs();
      expect(listed.map((type) => type.id)).not.toContain(hiddenId);
      expect(listed.filter((type) => type.name === 'Diagnóstico')).toHaveLength(1);

      // El control de repetidos sigue andando contra los tipos visibles.
      await expect(
        createTypeOfRepair({ name: 'diagnóstico ', description: 'Otro con el mismo nombre' })
      ).resolves.toMatchObject({
        ok: false,
      });
      // El oculto es del sistema: no se edita ni se borra desde la configuración.
      await expect(updateTypeOfRepair({ name: 'Otro nombre' }, hiddenId)).resolves.toMatchObject({ ok: false });
      await expect(deleteTypeOfRepair(hiddenId)).resolves.toMatchObject({ ok: false });
      await expect(owner.types_of_repairs.count({ where: { id: hiddenId, name: 'Diagnóstico' } })).resolves.toBe(1);
    });
  });
});
