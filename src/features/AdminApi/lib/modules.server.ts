import 'server-only';

import {
  CORE_MODULE,
  MODULE_CATALOG,
  SWITCHABLE_MODULE_KEYS,
  directDependentsOf,
  isModuleKey,
  type ModuleKey,
} from '@/features/Modules/catalog';
import { reconcileKindsFor } from '@/features/Modules/server/reconcile.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prismaSystem } from '@/shared/lib/prisma-system';
import type { ApplyRequestInput, PlanRequestInput } from '../schemas/modules';
import {
  computeModulePlan,
  computeStateVersion,
  instanceEnabledSet,
  type ModuleState,
  type PlanEffect,
} from './modules-plan';

/**
 * Lectura y aplicación del estado de los módulos para la API de administración (F3.1). Todo con el cliente de sistema
 * (BYPASSRLS): la API ve todas las empresas de la instancia, y las tablas de estado están cerradas para la app.
 */

const logger = new Logger('features/AdminApi/modules');

/** Clave de `instance_settings` donde `scripts/sync-module-catalog.ts` deja el resultado del último sync. */
const CATALOG_SYNC_SETTING = 'module_catalog_sync';

type Db = Pick<Prisma.TransactionClient, 'instance_modules' | 'company_modules' | 'company'>;

async function readState(db: Db): Promise<ModuleState> {
  const [instanceRows, companyRows, companies] = await Promise.all([
    db.instance_modules.findMany({ select: { module_key: true, enabled: true } }),
    db.company_modules.findMany({ select: { company_id: true, module_key: true, enabled: true } }),
    db.company.findMany({ select: { id: true } }),
  ]);
  const byCompany = new Map<string, Map<string, boolean>>(companies.map((c) => [c.id, new Map()]));
  for (const row of companyRows) byCompany.get(row.company_id)?.set(row.module_key, row.enabled);
  return { instance: new Map(instanceRows.map((row) => [row.module_key, row.enabled])), companies: byCompany };
}

/** Estado actual del control de módulos (los mismos datos que `GET /modules`). */
export async function getModulesOverview() {
  const [instanceRows, companyRows, companies, syncRow] = await Promise.all([
    prismaSystem.instance_modules.findMany(),
    prismaSystem.company_modules.findMany({
      where: { enabled: false },
      select: { company_id: true, module_key: true },
    }),
    prismaSystem.company.findMany({
      select: { id: true, company_name: true, is_active: true },
      orderBy: { company_name: 'asc' },
    }),
    prismaSystem.instance_settings.findUnique({ where: { key: CATALOG_SYNC_SETTING }, select: { value: true } }),
  ]);
  const state = await readState(prismaSystem);
  const instanceByKey = new Map(instanceRows.map((row) => [row.module_key, row]));
  const disabledByKey = new Map<string, string[]>();
  const disabledByCompany = new Map<string, ModuleKey[]>();
  for (const row of companyRows) {
    if (!isModuleKey(row.module_key)) continue;
    disabledByKey.set(row.module_key, [...(disabledByKey.get(row.module_key) ?? []), row.company_id]);
    disabledByCompany.set(row.company_id, [...(disabledByCompany.get(row.company_id) ?? []), row.module_key]);
  }

  return {
    catalogSha: process.env.GIT_SHA || null,
    stateVersion: computeStateVersion(state),
    core: [CORE_MODULE],
    modules: SWITCHABLE_MODULE_KEYS.map((key) => {
      const def = MODULE_CATALOG[key];
      const row = instanceByKey.get(key);
      return {
        key,
        name: def.name,
        description: def.description,
        requires: [...def.requires],
        requiresAny: (def.requiresAny ?? []).map((group) => [...group]),
        requiredBy: directDependentsOf(key),
        softDeps: [...def.softDeps],
        instance: row
          ? { enabled: row.enabled, changedAt: row.changed_at.toISOString(), changedBy: row.changed_by }
          : null,
        disabledInCompanies: disabledByKey.get(key) ?? [],
      };
    }),
    companies: companies.map((company) => ({
      id: company.id,
      name: company.company_name,
      isActive: company.is_active,
      disabled: disabledByCompany.get(company.id) ?? [],
    })),
    catalogSync: parseCatalogSync(syncRow?.value),
  };
}

function parseCatalogSync(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string') return null;
  return {
    at: v.at,
    tabsOwned: Number(v.tabsOwned) || 0,
    tabsMissingOwner: Number(v.tabsMissingOwner) || 0,
    rows: Number(v.rows) || 0,
  };
}

/** Resumen para `GET /status` (`modules_state`). */
export async function getModulesStateSummary() {
  const [state, syncRow] = await Promise.all([
    readState(prismaSystem),
    prismaSystem.instance_settings.findUnique({ where: { key: CATALOG_SYNC_SETTING }, select: { value: true } }),
  ]);
  const enabled = instanceEnabledSet(state);
  return {
    enabled: SWITCHABLE_MODULE_KEYS.filter((key) => enabled.has(key)),
    disabled: SWITCHABLE_MODULE_KEYS.filter((key) => !enabled.has(key)),
    companies_with_restrictions: [...state.companies.values()].filter((rows) => [...rows.values()].some((on) => !on))
      .length,
    state_version: computeStateVersion(state),
    catalog_sync: parseCatalogSync(syncRow?.value),
  };
}

/** Vista previa: el plan sobre el estado actual, sin escribir. */
export async function previewModuleChanges(request: PlanRequestInput) {
  const state = await readState(prismaSystem);
  const plan = computeModulePlan(state, request);
  // Lo que correrá al encender (por tipo; las empresas se resuelven al aplicar, después del commit).
  const reconcile: string[] = plan.applicable ? reconcileKindsFor(plan.effective) : [];
  return { stateVersion: computeStateVersion(state), ...plan, reconcile };
}

export type ApplyOutcome =
  | { status: 'applied'; stateVersion: string; requestId: string; replayed: boolean; applied: PlanEffect[] }
  | { status: 'stale'; stateVersion: string }
  | { status: 'blocked'; plan: Awaited<ReturnType<typeof previewModuleChanges>> };

/**
 * Aplica el plan dentro de una transacción con lock: recalcula el plan con el estado vigente, exige la misma versión
 * que vio la vista previa (`STALE_PLAN` si no), escribe las filas y una fila de auditoría por clave efectiva.
 * `requestId` (= `Idempotency-Key`): un reintento con la misma clave devuelve lo ya aplicado sin volver a escribir.
 */
export async function applyModuleChanges(
  request: ApplyRequestInput,
  meta: { requestId: string; actorEmail: string }
): Promise<ApplyOutcome> {
  return prismaSystem.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('module_control'))`;

      const previous = await tx.module_change_log.findMany({
        where: { request_id: meta.requestId },
        orderBy: { created_at: 'asc' },
      });
      const state = await readState(tx);
      const stateVersion = computeStateVersion(state);
      if (previous.length > 0) {
        return {
          status: 'applied' as const,
          stateVersion,
          requestId: meta.requestId,
          replayed: true,
          applied: previous.flatMap((row) =>
            isModuleKey(row.module_key)
              ? [
                  {
                    scope: row.scope as PlanEffect['scope'],
                    companyId: row.company_id,
                    key: row.module_key,
                    from: row.from_enabled,
                    to: row.to_enabled,
                    cause: row.cause as PlanEffect['cause'],
                  },
                ]
              : []
          ),
        };
      }

      if (stateVersion !== request.expectedStateVersion) return { status: 'stale' as const, stateVersion };
      const plan = computeModulePlan(state, request);
      if (!plan.applicable) {
        return { status: 'blocked' as const, plan: { stateVersion, ...plan, reconcile: [] as string[] } };
      }

      const now = new Date();
      for (const effect of plan.effective) {
        const audit = { changed_at: now, changed_by: meta.actorEmail, reason: request.reason };
        if (effect.scope === 'instance') {
          await tx.instance_modules.upsert({
            where: { module_key: effect.key },
            create: { module_key: effect.key, enabled: effect.to, ...audit },
            update: { enabled: effect.to, ...audit },
          });
        } else if (effect.companyId) {
          await tx.company_modules.upsert({
            where: { company_id_module_key: { company_id: effect.companyId, module_key: effect.key } },
            create: { company_id: effect.companyId, module_key: effect.key, enabled: effect.to, ...audit },
            update: { enabled: effect.to, ...audit },
          });
        }
      }
      if (plan.effective.length > 0) {
        await tx.module_change_log.createMany({
          data: plan.effective.map((effect) => ({
            request_id: meta.requestId,
            scope: effect.scope,
            company_id: effect.companyId,
            module_key: effect.key,
            from_enabled: effect.from,
            to_enabled: effect.to,
            cause: effect.cause,
            actor_email: meta.actorEmail,
            origin: 'taskapp',
            reason: request.reason,
          })),
        });
      }
      const after = computeStateVersion(await readState(tx));
      logger.info('Cambio de módulos aplicado', {
        data: { requestId: meta.requestId, effects: plan.effective.length, actor: meta.actorEmail },
      });
      return {
        status: 'applied' as const,
        stateVersion: after,
        requestId: meta.requestId,
        replayed: false,
        applied: plan.effective,
      };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

/** Historial de cambios, agrupado por pedido (los más nuevos primero). */
export async function getModuleChangeLog(query: { limit: number; before?: string }) {
  const rows = await prismaSystem.module_change_log.findMany({
    where: query.before ? { created_at: { lt: new Date(query.before) } } : undefined,
    orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    take: query.limit,
  });
  const groups = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) groups.set(row.request_id, [...(groups.get(row.request_id) ?? []), row]);
  return {
    requests: [...groups.entries()].map(([requestId, items]) => ({
      requestId,
      createdAt: items[0].created_at.toISOString(),
      actorEmail: items[0].actor_email,
      origin: items[0].origin,
      reason: items[0].reason,
      changes: items.map((item) => ({
        scope: item.scope as PlanEffect['scope'],
        companyId: item.company_id,
        key: item.module_key,
        from: item.from_enabled,
        to: item.to_enabled,
        cause: item.cause as PlanEffect['cause'],
      })),
    })),
    nextBefore: rows.length === query.limit ? rows[rows.length - 1].created_at.toISOString() : null,
  };
}
