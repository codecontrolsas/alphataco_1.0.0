import { PERMISSIONS } from '@/features/Permissions/permissions-map';
import type { PrismaClient } from '@/generated/prisma/client';
import { ensureCity, ensureCountry, ensureDefaultRole } from '@/test/db-fixtures';

/**
 * Datos de prueba de las suites de integración bajo los roles reales (`scripts/test-rls.sh`, `scripts/test-jobs.sh`).
 *
 * En CI la base `alphataco` sale SOLO de las migraciones, sin seed: no existen las acciones `view`/`create`/…, ni los
 * módulos que siembra `npm run db:seed` (Empleados, Dashboard). Las políticas que piden un permiso
 * (`app_has_permission`) necesitan esas filas, así que cada suite asegura lo que usa del catálogo con los ids reales de
 * `permissions-map.ts` y borra al final SOLO lo que creó (en una base sembrada no toca nada del seed).
 */

type MapTab = { slug: string; name?: string; tabId?: string; subtabs?: Record<string, MapTab> };
type MapModule = { slug: string; name: string; moduleId: string; tabs: Record<string, MapTab> };

const MAP = PERMISSIONS as unknown as Record<string, MapModule>;

function findTab(tabs: Record<string, MapTab>, slug: string): MapTab | null {
  if (tabs[slug]) return tabs[slug];
  for (const tab of Object.values(tabs)) {
    const found = tab.subtabs ? findTab(tab.subtabs, slug) : null;
    if (found) return found;
  }
  return null;
}

/** Filas del catálogo de permisos que creó la suite (si ya existían, no se tocan). */
export interface CatalogRows {
  modules: string[];
  tabs: string[];
  actions: string[];
}

export function emptyCatalogRows(): CatalogRows {
  return { modules: [], tabs: [], actions: [] };
}

/** `tabs.id` de `modulo:tab`, creando módulo y pestaña si faltan (con los ids del mapa). */
async function ensureTab(owner: PrismaClient, moduleSlug: string, tabSlug: string, created: CatalogRows) {
  const moduleDef = MAP[moduleSlug];
  const tabDef = moduleDef ? findTab(moduleDef.tabs, tabSlug) : null;
  if (!moduleDef || !tabDef) throw new Error(`La clave ${moduleSlug}:${tabSlug} no está en permissions-map.ts`);

  let moduleRow = await owner.modules.findUnique({ where: { slug: moduleSlug }, select: { id: true } });
  if (!moduleRow) {
    moduleRow = await owner.modules.create({
      data: { id: moduleDef.moduleId, slug: moduleSlug, name: moduleDef.name, price: 0, description: 'Prueba RLS' },
      select: { id: true },
    });
    created.modules.push(moduleRow.id);
  }
  const existing = await owner.tabs.findFirst({
    where: { module_id: moduleRow.id, slug: tabSlug },
    select: { id: true },
  });
  if (existing) return existing.id;
  const tab = await owner.tabs.create({
    data: { id: tabDef.tabId, module_id: moduleRow.id, slug: tabSlug, name: tabDef.name ?? tabSlug },
    select: { id: true },
  });
  created.tabs.push(tab.id);
  return tab.id;
}

async function ensureAction(owner: PrismaClient, slug: string, created: CatalogRows) {
  const existing = await owner.actions.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const action = await owner.actions.create({ data: { slug, name: slug }, select: { id: true } });
  created.actions.push(action.id);
  return action.id;
}

/**
 * Concede permisos `modulo:tab:accion` a un usuario en una empresa por `user_permissions` (el mismo camino que un
 * ajuste personal: lo lee `get_user_permissions`, que usan `app_has_permission` y la web).
 */
export async function grantPermissions(
  owner: PrismaClient,
  created: CatalogRows,
  grant: { userId: string; companyId: string; keys: readonly string[] }
): Promise<void> {
  for (const key of grant.keys) {
    const [moduleSlug, tabSlug, actionSlug] = key.split(':');
    if (!moduleSlug || !tabSlug || !actionSlug) throw new Error(`Clave inválida: ${key}`);
    const tabId = await ensureTab(owner, moduleSlug, tabSlug, created);
    const actionId = await ensureAction(owner, actionSlug, created);
    await owner.user_permissions.create({
      data: {
        user_id: grant.userId,
        tab_id: tabId,
        action_id: actionId,
        company_id: grant.companyId,
        is_granted: true,
      },
    });
  }
}

/** Borra lo que la suite creó del catálogo. Antes hay que borrar sus `user_permissions`. */
export async function dropCatalogRows(owner: PrismaClient, created: CatalogRows): Promise<void> {
  if (created.tabs.length) {
    await owner.user_permissions.deleteMany({ where: { tab_id: { in: created.tabs } } });
    await owner.role_permissions.deleteMany({ where: { tab_id: { in: created.tabs } } });
    await owner.tabs.deleteMany({ where: { id: { in: created.tabs } } });
  }
  if (created.actions.length) {
    await owner.user_permissions.deleteMany({ where: { action_id: { in: created.actions } } });
    await owner.role_permissions.deleteMany({ where: { action_id: { in: created.actions } } });
    await owner.actions.deleteMany({ where: { id: { in: created.actions } } });
  }
  if (created.modules.length) await owner.modules.deleteMany({ where: { id: { in: created.modules } } });
  created.modules = [];
  created.tabs = [];
  created.actions = [];
}

/** Credencial (`auth_user`) + perfil con el mismo id, como el alta de usuarios. */
export async function createTestUser(
  owner: PrismaClient,
  user: { id: string; email: string; fullname: string; employeeId?: string | null }
): Promise<void> {
  await ensureDefaultRole(owner);
  const now = new Date();
  await owner.user.create({
    data: { id: user.id, name: user.fullname, email: user.email, emailVerified: true, createdAt: now, updatedAt: now },
  });
  await owner.profile.create({
    data: {
      id: user.id,
      credential_id: user.id,
      email: user.email,
      fullname: user.fullname,
      employee_id: user.employeeId ?? null,
    },
  });
}

/** Borra credenciales y perfiles de prueba (y lo que cuelga de la credencial: sesiones, cuentas). */
export async function dropTestUsers(owner: PrismaClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await owner.user_permissions.deleteMany({ where: { user_id: { in: ids } } });
  await owner.share_company_users.deleteMany({ where: { profile_id: { in: ids } } });
  await owner.profile.deleteMany({ where: { id: { in: ids } } });
  await owner.session.deleteMany({ where: { userId: { in: ids } } });
  await owner.account.deleteMany({ where: { userId: { in: ids } } });
  await owner.user.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Empleado mínimo de prueba. `seed` (1–9999) arma CUIL, DNI y legajo únicos: cada suite usa su propio rango para no
 * chocar con otra que haya quedado a medio limpiar.
 */
export async function createTestEmployee(
  owner: PrismaClient,
  employee: {
    id: string;
    companyId: string;
    seed: number;
    lastname: string;
    firstname: string;
    file?: string;
    positionId?: string | null;
    sectorId?: string | null;
    email?: string | null;
    isActive?: boolean;
    admission?: string;
  }
): Promise<void> {
  const [city, country] = await Promise.all([ensureCity(owner), ensureCountry(owner)]);
  const digits = String(employee.seed).padStart(4, '0');
  await owner.employees.create({
    data: {
      id: employee.id,
      company_id: employee.companyId,
      lastname: employee.lastname,
      firstname: employee.firstname,
      cuil: `2099${digits}0001`,
      document_number: `99${digits}01`,
      birthplace: country.id,
      street: 'Calle de prueba',
      street_number: '1',
      province: city.province_id,
      city: city.id,
      phone: '0000000000',
      email: employee.email ?? null,
      file: employee.file ?? `T${digits}`,
      date_of_admission: new Date(`${employee.admission ?? '2020-01-01'}T00:00:00Z`),
      is_active: employee.isActive ?? true,
      company_position: employee.positionId ?? null,
      hierarchical_position: employee.sectorId ?? null,
    },
  });
}
