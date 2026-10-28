/**
 * Operaciones de mantenimiento del control de módulos (F3), compartidas por los scripts del contenedor y de desarrollo:
 *
 * - `syncModuleCatalog`: escribe `module_tab_owners` desde el catálogo funcional (`src/features/Modules/catalog.ts`) y
 *   el árbol de permisos. Idempotente (borra y reinserta en una transacción con lock), tolera una base sin pestañas
 *   (solo escribe las que existen) y deja el resultado en `instance_settings.module_catalog_sync`.
 * - `enableAllModules`: enciende TODAS las claves en la instancia y borra los apagados por empresa. Es para dev, CI, e2e
 *   y el reset de la demo; nunca para una instancia de un cliente (el script CLI lo rechaza en producción).
 *
 * Node ejecuta este archivo tal cual (sin bundler): imports relativos con `.ts` y solo `import type` para tipos.
 */
import { SWITCHABLE_MODULE_KEYS } from '../../src/features/Modules/catalog.ts';
import { buildTabOwners } from '../../src/features/Modules/tab-owners.ts';
import { PERMISSIONS } from '../../src/features/Permissions/permissions-map.ts';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.ts';

/** Clave de `instance_settings` con el resultado de la última sincronización (lo informa GET /api/admin/v1/modules). */
export const MODULE_CATALOG_SYNC_SETTING = 'module_catalog_sync';

type Tx = Pick<
  Prisma.TransactionClient,
  | '$executeRaw'
  | 'tabs'
  | 'module_tab_owners'
  | 'instance_settings'
  | 'instance_modules'
  | 'company_modules'
  | 'module_change_log'
>;

export interface CatalogSyncResult {
  at: string;
  rows: number;
  tabsOwned: number;
  /** Pestañas que existen en la base pero no en el árbol de permisos del código (quedan sin dueño: siempre visibles). */
  tabsMissingOwner: number;
}

/** Conexión de los scripts: el rol de sistema si está, si no el dueño (nunca el de la app, que no ve estas tablas). */
export function moduleControlDatabaseUrl(): string {
  const url = process.env.SYSTEM_DATABASE_URL ?? process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta SYSTEM_DATABASE_URL, MIGRATE_DATABASE_URL o DATABASE_URL');
  return url;
}

/** Sincroniza la pertenencia pestaña → clave dentro de una transacción ya abierta. */
export async function syncModuleCatalogTx(tx: Tx): Promise<CatalogSyncResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('module_catalog_sync'))`;
  const owners = buildTabOwners(PERMISSIONS);
  const existing = await tx.tabs.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((tab) => tab.id));
  const ownedIds = new Set(owners.map((row) => row.tabId));

  const data = owners
    .filter((row) => existingIds.has(row.tabId))
    .flatMap((row) => row.keys.map((moduleKey) => ({ tab_id: row.tabId, module_key: moduleKey })));

  await tx.module_tab_owners.deleteMany({});
  if (data.length > 0) await tx.module_tab_owners.createMany({ data });

  const result: CatalogSyncResult = {
    at: new Date().toISOString(),
    rows: data.length,
    tabsOwned: owners.filter((row) => existingIds.has(row.tabId)).length,
    tabsMissingOwner: existing.filter((tab) => !ownedIds.has(tab.id)).length,
  };
  await tx.instance_settings.upsert({
    where: { key: MODULE_CATALOG_SYNC_SETTING },
    create: {
      key: MODULE_CATALOG_SYNC_SETTING,
      value: { ...result },
      description: 'Última sincronización del catálogo de módulos (scripts/sync-module-catalog.ts).',
    },
    update: { value: { ...result }, updated_at: new Date() },
  });
  return result;
}

export async function syncModuleCatalog(db: PrismaClient): Promise<CatalogSyncResult> {
  return db.$transaction((tx) => syncModuleCatalogTx(tx), { timeout: 60_000 });
}

/**
 * Enciende todas las claves en la instancia y borra los apagados por empresa, con su auditoría (`origin` = script).
 * Devuelve cuántas claves cambiaron. Dentro de una transacción ya abierta (el reset de la demo usa la suya).
 */
export async function enableAllModulesTx(
  tx: Tx,
  options: { actor: string; reason: string }
): Promise<{ changed: number; companyRowsRemoved: number }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('module_control'))`;
  const [instanceRows, companyRows] = await Promise.all([
    tx.instance_modules.findMany({ select: { module_key: true, enabled: true } }),
    tx.company_modules.findMany({ where: { enabled: false }, select: { company_id: true, module_key: true } }),
  ]);
  const current = new Map(instanceRows.map((row) => [row.module_key, row.enabled]));
  const toEnable = SWITCHABLE_MODULE_KEYS.filter((key) => current.get(key) !== true);
  const requestId = crypto.randomUUID();

  for (const key of toEnable) {
    await tx.instance_modules.upsert({
      where: { module_key: key },
      create: { module_key: key, enabled: true, changed_by: options.actor, reason: options.reason },
      update: { enabled: true, changed_by: options.actor, reason: options.reason, changed_at: new Date() },
    });
  }
  await tx.company_modules.deleteMany({});

  const log = [
    ...toEnable.map((key) => ({
      request_id: requestId,
      scope: 'instance',
      company_id: null,
      module_key: key,
      from_enabled: current.get(key) ?? null,
      to_enabled: true,
    })),
    ...companyRows.map((row) => ({
      request_id: requestId,
      scope: 'company',
      company_id: row.company_id,
      module_key: row.module_key,
      from_enabled: false,
      to_enabled: true,
    })),
  ].map((row) => ({
    ...row,
    cause: 'requested',
    actor_email: options.actor,
    origin: 'script',
    reason: options.reason,
  }));
  if (log.length > 0) await tx.module_change_log.createMany({ data: log });

  return { changed: toEnable.length, companyRowsRemoved: companyRows.length };
}

export async function enableAllModules(
  db: PrismaClient,
  options: { actor: string; reason: string }
): Promise<{ changed: number; companyRowsRemoved: number }> {
  return db.$transaction((tx) => enableAllModulesTx(tx, options), { timeout: 60_000 });
}
