import 'server-only';

import { reconcileDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { reconcileHse } from '@/features/Hse/use-cases/sync-acknowledgements';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { MODULE_CATALOG, type ModuleDef, type ModuleKey } from '../catalog';
import { getEnabledModulesFor } from './modules.server';

/**
 * Reconciliación al ENCENDER un módulo (`onEnable` del catálogo, F3.2): los cachés derivados (`employees.status`,
 * `vehicles.status`, aceptaciones de HSE) se congelan mientras su fuente está apagada y acá se dejan como si nunca se
 * hubiera apagado. Corre DESPUÉS del commit del cambio de estado, por empresa, con la empresa como contexto de `prisma`
 * (los `hse_sync_*` son SECURITY DEFINER y exigen la empresa del contexto) y con tiempo límite. Un fallo no revierte el
 * cambio de estado: se informa y el job diario (`documents-status`) lo corrige igual.
 */

const logger = new Logger('features/Modules/reconcile');

export type ReconcileKind = NonNullable<ModuleDef['onEnable']>;

/** Tiempo máximo de la reconciliación de UNA empresa. */
const RECONCILE_TIMEOUT_MS = 120_000;

export interface EnabledEffect {
  scope: 'instance' | 'company';
  companyId: string | null;
  key: ModuleKey;
  to: boolean;
}

/** Qué reconciliaciones dispara un cambio: las de los módulos que pasaron a encendidos (sin empresas; para la vista previa). */
export function reconcileKindsFor(effects: readonly Pick<EnabledEffect, 'key' | 'to'>[]): ReconcileKind[] {
  const kinds = new Set<ReconcileKind>();
  for (const effect of effects) {
    const kind = effect.to ? MODULE_CATALOG[effect.key].onEnable : undefined;
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

/** Pares (reconciliación, empresa) a correr: el encendido de la instancia alcanza a las empresas que lo tienen encendido. */
export async function resolveReconcileTargets(
  effects: readonly EnabledEffect[]
): Promise<{ kind: ReconcileKind; companyId: string }[]> {
  const targets = new Map<string, { kind: ReconcileKind; companyId: string }>();
  for (const effect of effects) {
    const kind = effect.to ? MODULE_CATALOG[effect.key].onEnable : undefined;
    if (!kind) continue;
    let companyIds: string[];
    if (effect.scope === 'company' && effect.companyId) {
      companyIds = [effect.companyId];
    } else {
      const companies = await prismaSystem.company.findMany({ select: { id: true } });
      const flags = await Promise.all(
        companies.map(async (c) => ((await getEnabledModulesFor(c.id)).has(effect.key) ? c.id : null))
      );
      companyIds = flags.filter((id): id is string => id !== null);
    }
    for (const companyId of companyIds) targets.set(`${kind}:${companyId}`, { kind, companyId });
  }
  return [...targets.values()];
}

async function reconcileOne(kind: ReconcileKind, companyId: string): Promise<void> {
  await runInCompanyScope(
    companyId,
    () =>
      prisma.$transaction(
        async (tx) => {
          if (kind === 'reconcile-documents') await reconcileDocumentStatus(tx, companyId);
          else await reconcileHse(tx, companyId);
        },
        { timeout: RECONCILE_TIMEOUT_MS, maxWait: 10_000 }
      ),
    'job'
  );
}

/** Corre las reconciliaciones de un cambio ya aplicado. Devuelve una línea por empresa: `<tipo>:<empresa>:ok|error`. */
export async function runReconcileOnEnable(effects: readonly EnabledEffect[]): Promise<string[]> {
  const targets = await resolveReconcileTargets(effects);
  const results: string[] = [];
  for (const { kind, companyId } of targets) {
    try {
      await reconcileOne(kind, companyId);
      results.push(`${kind}:${companyId}:ok`);
    } catch (error) {
      logger.error('Falló la reconciliación al encender un módulo', { data: { error, kind, companyId } });
      results.push(`${kind}:${companyId}:error`);
    }
  }
  return results;
}
