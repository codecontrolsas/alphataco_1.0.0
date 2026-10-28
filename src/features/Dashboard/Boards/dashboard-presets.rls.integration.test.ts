import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import { asContext } from '@/test/hse-fixtures';
import { createTestUser, dropTestUsers } from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Presets del Dashboard (#802) bajo el rol REAL de la app, con dos empresas: el dueño ve y modifica; con quien se
 * comparte, solo ve; un tercero no lo ve. Alcances «solo yo», «toda la organización» y «usuarios puntuales». Tope de
 * tableros por usuario.
 *
 * Las acciones corren de verdad (sesión y empresa simuladas); los permisos de la web se dan por buenos y el catálogo de
 * widgets visibles queda vacío (los presets se guardan sin widgets: lo que se prueba es quién ve y quién escribe).
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({ ctx: null as TenantContext | null }));

vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => state.ctx?.userId ?? null,
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
vi.mock('@/features/Permissions/actions/permissions.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Permissions/actions/permissions.server')>()),
  checkPermissionServer: async () => true,
  checkMultiplePermissionsServer: async () => new Map<string, boolean>(),
}));

const COMPANY_A = '7c200000-0000-4000-8000-00000000000a';
const COMPANY_B = '7c200000-0000-4000-8000-00000000000b';
const OWNER_USER = '7c200000-0000-4000-8000-0000000001a1';
const SHARED_USER = '7c200000-0000-4000-8000-0000000001a2';
const THIRD_USER = '7c200000-0000-4000-8000-0000000001a3';
const OTHER_COMPANY_USER = '7c200000-0000-4000-8000-0000000001b1';

const ctxOf = (userId: string, companyId = COMPANY_A): TenantContext => ({ companyId, userId, kind: 'user' });

let owner: PrismaClient;

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.user_dashboards.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [OWNER_USER, SHARED_USER, THIRD_USER, OTHER_COMPANY_USER]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

async function boardsSeenBy(userId: string, companyId = COMPANY_A) {
  const { getUserBoards } = await import('./lib/boards.server');
  state.ctx = ctxOf(userId, companyId);
  return getUserBoards();
}

async function createPreset(name: string, visibility: 'private' | 'company' | 'users', userIds: string[] = []) {
  const { createDashboardPreset } = await import('./actions/boards.server');
  state.ctx = ctxOf(OWNER_USER);
  const result = await createDashboardPreset({ name, layout: [], visibility, userIds });
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

describe.skipIf(!RUN_RLS)('presets del Dashboard bajo RLS (rol alphataco_app)', () => {
  const ids = { private: '', company: '', users: '' };

  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__rls_presets_A__', cuit: 'RLS-PRESET-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__rls_presets_B__', cuit: 'RLS-PRESET-B', cityId: city.id });
    for (const [id, name, company] of [
      [OWNER_USER, 'Dueña', COMPANY_A],
      [SHARED_USER, 'Compartido', COMPANY_A],
      [THIRD_USER, 'Tercero', COMPANY_A],
      [OTHER_COMPANY_USER, 'Otra empresa', COMPANY_B],
    ] as const) {
      await createTestUser(owner, { id, email: `${id.slice(-4)}@rls-presets.test`, fullname: name });
      await owner.share_company_users.create({ data: { company_id: company, profile_id: id } });
    }
    ids.private = await createPreset('Mío', 'private');
    ids.company = await createPreset('Para todos', 'company');
    ids.users = await createPreset('Para uno', 'users', [SHARED_USER]);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
  });

  beforeEach(() => {
    state.ctx = null;
  });

  it('el dueño ve los tres; con quien se comparte ve los suyos; un tercero solo el de la organización', async () => {
    const mine = await boardsSeenBy(OWNER_USER);
    expect(mine.map((b) => [b.name, b.isOwner, b.visibility]).sort()).toEqual(
      [
        ['Mío', true, 'private'],
        ['Para todos', true, 'company'],
        ['Para uno', true, 'users'],
      ].sort()
    );
    expect(mine.find((b) => b.id === ids.users)?.sharedUserIds).toEqual([SHARED_USER]);

    const shared = await boardsSeenBy(SHARED_USER);
    expect(shared.map((b) => b.name).sort()).toEqual(['Para todos', 'Para uno']);
    expect(shared.every((b) => !b.isOwner && b.ownerName === 'Dueña')).toBe(true);
    // A quien recibe no se le informa con quién más se compartió.
    expect(shared.every((b) => b.sharedUserIds.length === 0)).toBe(true);

    await expect(boardsSeenBy(THIRD_USER).then((boards) => boards.map((b) => b.name))).resolves.toEqual(['Para todos']);
    // Otra empresa: nada, ni el de «toda la organización».
    await expect(boardsSeenBy(OTHER_COMPANY_USER, COMPANY_B)).resolves.toEqual([]);
  });

  it('la RLS lo sostiene aunque la consulta no filtre: quien no es dueño no lee de más ni escribe', async () => {
    const all = { company_id: { in: [COMPANY_A, COMPANY_B] } };
    await expect(asContext(ctxOf(THIRD_USER), (tx) => tx.user_dashboards.count({ where: all }))).resolves.toBe(1);
    await expect(asContext(ctxOf(SHARED_USER), (tx) => tx.user_dashboards.count({ where: all }))).resolves.toBe(2);
    await expect(
      asContext(ctxOf(OTHER_COMPANY_USER, COMPANY_B), (tx) => tx.user_dashboards.count({ where: all }))
    ).resolves.toBe(0);

    for (const id of [ids.company, ids.users]) {
      await expect(
        asContext(ctxOf(SHARED_USER), (tx) =>
          tx.user_dashboards.updateMany({ where: { id }, data: { name: 'Pisado' } })
        )
      ).resolves.toEqual({ count: 0 });
      await expect(
        asContext(ctxOf(SHARED_USER), (tx) => tx.user_dashboards.deleteMany({ where: { id } }))
      ).resolves.toEqual({ count: 0 });
    }
    // Ni se lo apropia creando uno a nombre del dueño.
    await expect(
      asContext(ctxOf(SHARED_USER), (tx) =>
        tx.user_dashboards.create({ data: { user_id: OWNER_USER, company_id: COMPANY_A, name: 'Falso', layout: [] } })
      )
    ).rejects.toThrow();
    await expect(owner.user_dashboards.count({ where: { name: { in: ['Pisado', 'Falso'] } } })).resolves.toBe(0);
  });

  it('las acciones de quien recibe un preset no lo modifican (renombrar, alcance, borrar)', async () => {
    const { renameUserBoard, updateDashboardPresetScope, deleteUserBoard, duplicateDashboardPreset } = await import(
      './actions/boards.server'
    );
    state.ctx = ctxOf(SHARED_USER);
    await expect(renameUserBoard({ boardId: ids.users, name: 'Mío ahora' })).resolves.toMatchObject({ ok: false });
    await expect(
      updateDashboardPresetScope({ boardId: ids.users, visibility: 'company', addUserIds: [], removeUserIds: [] })
    ).resolves.toMatchObject({ ok: false });
    await expect(deleteUserBoard({ boardId: ids.users })).resolves.toMatchObject({ ok: false });
    // Duplicar es solo de presets propios (quien recibe lo copia con «Guardar como preset»).
    await expect(duplicateDashboardPreset({ boardId: ids.users, name: 'Copia' })).resolves.toMatchObject({ ok: false });
    await expect(
      owner.user_dashboards.findUniqueOrThrow({ where: { id: ids.users }, select: { name: true, visibility: true } })
    ).resolves.toEqual({ name: 'Para uno', visibility: 'users' });
  });

  it('cambiar el alcance: altas y bajas explícitas, y al pasar a «solo yo» deja de verse', async () => {
    const { updateDashboardPresetScope } = await import('./actions/boards.server');
    state.ctx = ctxOf(OWNER_USER);
    await expect(
      updateDashboardPresetScope({
        boardId: ids.users,
        visibility: 'users',
        addUserIds: [THIRD_USER],
        removeUserIds: [],
      })
    ).resolves.toMatchObject({ ok: true, data: { added: 1, removed: 0, sharedWith: 2 } });
    await expect(boardsSeenBy(THIRD_USER).then((b) => b.map((x) => x.name).sort())).resolves.toEqual([
      'Para todos',
      'Para uno',
    ]);

    // Un usuario de otra empresa no se puede agregar.
    state.ctx = ctxOf(OWNER_USER);
    await expect(
      updateDashboardPresetScope({
        boardId: ids.users,
        visibility: 'users',
        addUserIds: [OTHER_COMPANY_USER],
        removeUserIds: [],
      })
    ).resolves.toMatchObject({ ok: false });

    await expect(
      updateDashboardPresetScope({ boardId: ids.users, visibility: 'private', addUserIds: [], removeUserIds: [] })
    ).resolves.toMatchObject({ ok: true, data: { removed: 2, sharedWith: 0 } });
    await expect(boardsSeenBy(SHARED_USER).then((b) => b.map((x) => x.name))).resolves.toEqual(['Para todos']);
  });

  it('tope de 20 tableros por usuario', async () => {
    const { createUserBoard } = await import('./actions/boards.server');
    const { MAX_BOARDS } = await import('./lib/board-layout');
    expect(MAX_BOARDS).toBe(20);
    state.ctx = ctxOf(THIRD_USER);
    for (let i = 1; i <= MAX_BOARDS; i++) {
      await expect(createUserBoard({ name: `Tablero ${i}` })).resolves.toMatchObject({ ok: true });
    }
    await expect(createUserBoard({ name: 'Uno de más' })).resolves.toEqual({
      ok: false,
      error: 'Se admiten hasta 20 tableros',
    });
    await expect(owner.user_dashboards.count({ where: { user_id: THIRD_USER } })).resolves.toBe(MAX_BOARDS);
  });
});
