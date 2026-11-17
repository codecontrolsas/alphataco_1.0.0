import 'server-only';

import { arCurrentPeriod, arToday } from '@/features/Documentacion/shared/compliance/dates';
import { evaluateResource } from '@/features/Documentacion/shared/compliance/evaluation';
import { loadComplianceDataset } from '@/features/Documentacion/shared/compliance/server/dataset.server';
import type { ExpirySummaryDb } from './documents-expiry-summary.server';

/** Días antes del vencimiento en los que se avisa (cada documento avisa una vez en cada uno). */
export const EXPIRY_THRESHOLDS = [30, 15, 7, 1] as const;
export type ExpiryThreshold = (typeof EXPIRY_THRESHOLDS)[number];

export interface ThresholdItem {
  kind: 'Persona' | 'Equipos';
  resourceLabel: string;
  typeName: string;
  /** `YYYY-MM-DD` */
  validity: string;
}

/**
 * Documentos vigentes de personas y equipos ACTIVOS que vencen exactamente dentro de 30, 15, 7 o 1 día (hora
 * argentina), agrupados por umbral. Mismo motor que las listas: solo los requisitos que hoy le aplican a cada recurso.
 * Los tipos privados no se incluyen (el aviso no pasa por el permiso de tipos privados).
 */
export async function collectThresholdExpiries(
  db: ExpirySummaryDb,
  companyId: string,
  now: Date = new Date()
): Promise<Map<ExpiryThreshold, ThresholdItem[]>> {
  const today = arToday(now);
  const period = arCurrentPeriod(now);
  const thresholds = new Set<number>(EXPIRY_THRESHOLDS);
  const hits: Array<{
    kind: 'Persona' | 'Equipos';
    resourceId: string;
    typeId: string;
    validity: string;
    days: ExpiryThreshold;
  }> = [];

  for (const kind of ['Persona', 'Equipos'] as const) {
    const dataset = await loadComplianceDataset(db, { companyId, kind });
    const privateTypes = new Set(dataset.types.filter((t) => t.isPrivate).map((t) => t.id));
    for (const resource of dataset.resources) {
      if (!resource.isActive) continue;
      const evaluation = evaluateResource(resource, dataset.types, dataset.docsByResource.get(resource.id) ?? [], {
        today,
        period,
      });
      for (const req of evaluation.requirements) {
        if (privateTypes.has(req.typeId)) continue;
        if (req.state !== 'presentado' && req.state !== 'aprobado') continue;
        if (!req.doc?.validityDay || req.daysToExpiry === null || !thresholds.has(req.daysToExpiry)) continue;
        hits.push({
          kind,
          resourceId: resource.id,
          typeId: req.typeId,
          validity: req.doc.validityDay,
          days: req.daysToExpiry as ExpiryThreshold,
        });
      }
    }
  }

  const result = new Map<ExpiryThreshold, ThresholdItem[]>();
  if (hits.length === 0) return result;

  const typeIds = [...new Set(hits.map((h) => h.typeId))];
  const employeeIds = [...new Set(hits.filter((h) => h.kind === 'Persona').map((h) => h.resourceId))];
  const vehicleIds = [...new Set(hits.filter((h) => h.kind === 'Equipos').map((h) => h.resourceId))];
  const types = await db.document_types.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
  const employees = employeeIds.length
    ? await db.employees.findMany({
        where: { id: { in: employeeIds }, company_id: companyId },
        select: { id: true, file: true, lastname: true, firstname: true },
      })
    : [];
  const vehicles = vehicleIds.length
    ? await db.vehicles.findMany({
        where: { id: { in: vehicleIds }, company_id: companyId },
        select: { id: true, domain: true, intern_number: true, serie: true },
      })
    : [];
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const employeeLabel = new Map(employees.map((e) => [e.id, `[${e.file}] ${e.lastname} ${e.firstname}`]));
  const vehicleLabel = new Map(
    vehicles.map((v) => [v.id, [v.intern_number, v.domain].filter(Boolean).join(' - ') || v.serie || 'Equipo'])
  );

  for (const hit of hits) {
    const list = result.get(hit.days) ?? [];
    list.push({
      kind: hit.kind,
      resourceLabel: (hit.kind === 'Persona' ? employeeLabel : vehicleLabel).get(hit.resourceId) ?? '—',
      typeName: typeName.get(hit.typeId) ?? 'Documento',
      validity: hit.validity,
    });
    result.set(hit.days, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.resourceLabel.localeCompare(b.resourceLabel, 'es'));
  return result;
}
