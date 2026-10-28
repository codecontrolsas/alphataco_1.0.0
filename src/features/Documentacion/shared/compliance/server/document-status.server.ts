import 'server-only';

import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { toStatusType } from '../status';
import type { ComplianceApplies } from '../types';
import { evaluateDataset, loadComplianceDataset, type ComplianceDb } from './dataset.server';

const logger = new Logger('features/Documentacion/compliance/status');

/** Delegados que necesita el escritor del cache: los del cargador más `$executeRaw`. */
export type DocumentStatusDb = ComplianceDb & Pick<Prisma.TransactionClient, '$executeRaw'>;

export type RefreshTarget =
  /** Recursos puntuales. Sin `companyId` se resuelve la empresa de cada recurso en la base. */
  | { ids: readonly string[]; companyId?: string }
  /** Todos los recursos de la empresa. */
  | { companyId: string };

export interface RefreshResult {
  /** Recursos evaluados. */
  evaluated: number;
  /** Recursos cuyo `status` guardado cambió (sólo se escribe lo que cambia). */
  changed: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validIds(ids: readonly string[]): string[] {
  const valid = [...new Set(ids)].filter((id) => UUID_RE.test(id));
  if (valid.length !== new Set(ids).size) {
    logger.warn('Se descartaron ids de recurso que no son uuid', {
      data: { received: ids.length, valid: valid.length },
    });
  }
  return valid;
}

async function companiesOf(db: DocumentStatusDb, kind: ComplianceApplies, ids: string[]): Promise<string[]> {
  const table = Prisma.raw(kind === 'Persona' ? 'employees' : 'vehicles');
  const rows = await db.$queryRaw<Array<{ company_id: string }>>`
    SELECT DISTINCT company_id::text AS company_id FROM ${table}
    WHERE id = ANY(${ids}::uuid[]) AND company_id IS NOT NULL`;
  return rows.map((r) => r.company_id);
}

/**
 * ÚNICO escritor de `employees.status` / `vehicles.status`, que son un CACHE del cumplimiento
 * documental: carga el dataset, lo evalúa con el motor y escribe en UNA sentencia set-based,
 * sólo las filas cuyo valor cambia. Pasar el `tx` del escritor para que el refresh quede en su
 * misma transacción y se ejecute DESPUÉS de su última escritura sobre documentos o recursos.
 *
 * Con el módulo `documentacion` apagado para la empresa NO se recalcula: la RLS por módulo (F3.4) haría leer 0 documentos
 * y escribiría estados falsos en todo el padrón. El caché queda congelado y se reconcilia al encender
 * (`reconcileDocumentStatus`, desde `onEnable: 'reconcile-documents'`). Este es el único punto de salteo: cubre a todos los
 * llamadores.
 */
export async function refreshDocumentStatus(
  db: DocumentStatusDb,
  kind: ComplianceApplies,
  target: RefreshTarget,
  now: Date = new Date()
): Promise<RefreshResult> {
  let companyIds: string[];
  let resourceIds: string[] | undefined;

  if ('ids' in target) {
    resourceIds = validIds(target.ids);
    if (resourceIds.length === 0) return { evaluated: 0, changed: 0 };
    companyIds = target.companyId ? [target.companyId] : await companiesOf(db, kind, resourceIds);
  } else {
    companyIds = [target.companyId];
  }

  const table = Prisma.raw(kind === 'Persona' ? 'employees' : 'vehicles');
  let evaluated = 0;
  let changed = 0;

  for (const companyId of companyIds) {
    if (!(await isModuleEnabledForCompany('documentacion', companyId))) continue;
    const dataset = await loadComplianceDataset(db, { companyId, kind, resourceIds });
    if (dataset.resources.length === 0) continue;
    const evaluations = evaluateDataset(dataset, now);

    const ids: string[] = [];
    const states: string[] = [];
    for (const [resourceId, evaluation] of evaluations) {
      ids.push(resourceId);
      states.push(toStatusType(evaluation.status));
    }
    evaluated += ids.length;

    changed += await db.$executeRaw`
      UPDATE ${table} t SET status = v.s::status_type
      FROM unnest(${ids}::uuid[], ${states}::text[]) AS v(id, s)
      WHERE t.id = v.id AND t.company_id = ${companyId}::uuid
        AND t.status IS DISTINCT FROM v.s::status_type`;
  }

  return { evaluated, changed };
}

/** Atajo para los escritores de un recurso: refresca su `status` en la transacción en curso. */
export function refreshResourceStatus(
  db: DocumentStatusDb,
  kind: ComplianceApplies,
  companyId: string,
  resourceId: string
): Promise<RefreshResult> {
  return refreshDocumentStatus(db, kind, { ids: [resourceId], companyId });
}

/**
 * Reconciliación al ENCENDER `documentacion` en una empresa: recalcula el caché de todos los empleados y equipos, que
 * quedó congelado mientras el módulo estuvo apagado. Idempotente.
 */
export async function reconcileDocumentStatus(db: DocumentStatusDb, companyId: string): Promise<RefreshResult> {
  const employees = await refreshDocumentStatus(db, 'Persona', { companyId });
  const equipment = await refreshDocumentStatus(db, 'Equipos', { companyId });
  return {
    evaluated: employees.evaluated + equipment.evaluated,
    changed: employees.changed + equipment.changed,
  };
}
