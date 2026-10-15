import 'server-only';

import { arCurrentPeriod, arToday } from '@/features/Documentacion/shared/compliance/dates';
import { evaluateResource } from '@/features/Documentacion/shared/compliance/evaluation';
import {
  loadComplianceDataset,
  type ComplianceDb,
} from '@/features/Documentacion/shared/compliance/server/dataset.server';
import type { ComplianceKind } from '@/features/Documentacion/shared/compliance/types';
import type { Prisma } from '@/generated/prisma/client';
import type { ExpirySummary } from '../schemas/documents-expiry';
import { ARGENTINA_TIME_ZONE } from './dates';

/** Delegados del cargador del motor más los que hacen falta para resolver nombres del detalle. */
export type ExpirySummaryDb = ComplianceDb & Pick<Prisma.TransactionClient, 'employees' | 'vehicles'>;

export interface BuildExpirySummaryOptions {
  companyId: string;
  daysAhead: number;
  /** Máximo de filas de detalle por grupo (empleados / equipos / empresa). */
  detailLimit: number;
  now?: Date;
}

/** Documento con vencimiento en la ventana, antes de resolver nombres. */
interface ExpiringHit {
  docId: string;
  resourceId: string;
  typeId: string;
  validity: string;
  daysRemaining: number;
}

interface KindResult {
  expiring: ExpiringHit[];
  expiredCount: number;
  expiredTypeIds: Set<string>;
  missingCount: number;
}

const DAY_MS = 86_400_000;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function compareHits(a: ExpiringHit, b: ExpiringHit): number {
  if (a.validity !== b.validity) return a.validity < b.validity ? -1 : 1;
  return a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0;
}

/**
 * Evalúa con el motor todos los recursos de una empresa para un tipo de recurso y junta lo que le
 * importa al mail. Los tipos privados no cuentan: el mail va a una lista de destinatarios fija que
 * no pasa por el permiso de tipos privados que sí aplican las listas.
 */
async function collectKind(
  db: ExpirySummaryDb,
  companyId: string,
  kind: ComplianceKind,
  today: string,
  period: string,
  windowDays: number
): Promise<KindResult> {
  const dataset = await loadComplianceDataset(db, { companyId, kind });

  const result: KindResult = { expiring: [], expiredCount: 0, expiredTypeIds: new Set(), missingCount: 0 };

  for (const resource of dataset.resources) {
    const evaluation = evaluateResource(resource, dataset.types, dataset.docsByResource.get(resource.id) ?? [], {
      today,
      period,
    });
    for (const req of evaluation.requirements) {
      if (req.state === 'vencido') {
        result.expiredCount += 1;
        result.expiredTypeIds.add(req.typeId);
      } else if (req.state === 'faltante') {
        result.missingCount += 1;
      } else if (
        (req.state === 'presentado' || req.state === 'aprobado') &&
        req.doc &&
        req.doc.validityDay &&
        req.daysToExpiry !== null &&
        req.daysToExpiry >= 0 &&
        req.daysToExpiry <= windowDays
      ) {
        result.expiring.push({
          docId: req.doc.id,
          resourceId: resource.id,
          typeId: req.typeId,
          validity: req.doc.validityDay,
          daysRemaining: req.daysToExpiry,
        });
      }
    }
  }
  return result;
}

/**
 * Resumen semanal de documentos de UNA empresa, calculado con el motor de cumplimiento.
 * Misma forma que `expirySummarySchema` (la que devolvía `get_documents_expiry_summary`), con
 * `pending_counts` ahora = requisitos obligatorios aplicables SIN documento (mensuales: período
 * corriente). Vencidos y por vencer salen del documento vigente de cada requisito aplicable.
 * Tres cargas (una por tipo de recurso), en paralelo; los nombres se piden sólo para el detalle.
 */
export async function buildDocumentsExpirySummary(
  db: ExpirySummaryDb,
  options: BuildExpirySummaryOptions
): Promise<ExpirySummary> {
  const { companyId, daysAhead, detailLimit } = options;
  const now = options.now ?? new Date();
  const today = arToday(now);
  const period = arCurrentPeriod(now);

  const [persona, equipos, empresa] = await Promise.all([
    collectKind(db, companyId, 'Persona', today, period, daysAhead),
    collectKind(db, companyId, 'Equipos', today, period, daysAhead),
    collectKind(db, companyId, 'Empresa', today, period, daysAhead),
  ]);

  const top = (hits: ExpiringHit[]) => [...hits].sort(compareHits).slice(0, Math.max(0, detailLimit));
  const topPersona = top(persona.expiring);
  const topEquipos = top(equipos.expiring);
  const topEmpresa = top(empresa.expiring);

  const typeIds = [...new Set([...topPersona, ...topEquipos, ...topEmpresa].map((h) => h.typeId))];
  const [typeRows, employeeRows, vehicleRows] = await Promise.all([
    typeIds.length > 0
      ? db.document_types.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    topPersona.length > 0
      ? db.employees.findMany({
          where: { id: { in: [...new Set(topPersona.map((h) => h.resourceId))] }, company_id: companyId },
          select: { id: true, file: true, lastname: true, firstname: true },
        })
      : Promise.resolve([]),
    topEquipos.length > 0
      ? db.vehicles.findMany({
          where: { id: { in: [...new Set(topEquipos.map((h) => h.resourceId))] }, company_id: companyId },
          select: { id: true, domain: true, intern_number: true },
        })
      : Promise.resolve([]),
  ]);
  const typeName = new Map(typeRows.map((t) => [t.id, t.name]));
  const employeeById = new Map(employeeRows.map((e) => [e.id, e]));
  const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));

  const employeeDetail = topPersona
    .map((h) => {
      const e = employeeById.get(h.resourceId);
      return {
        id: h.docId,
        employee_id: h.resourceId,
        document_type_id: h.typeId,
        file_number: e ? String(e.file) : '—',
        employee_name: e ? `${e.lastname}, ${e.firstname}`.trim() : '—',
        document_type_name: typeName.get(h.typeId) ?? '—',
        validity: h.validity,
        days_remaining: h.daysRemaining,
      };
    })
    .sort((a, b) => a.validity.localeCompare(b.validity) || a.employee_name.localeCompare(b.employee_name, 'es'));

  const equipmentDetail = topEquipos
    .map((h) => {
      const v = vehicleById.get(h.resourceId);
      return {
        id: h.docId,
        vehicle_id: h.resourceId,
        document_type_id: h.typeId,
        domain: v?.domain ?? '—',
        intern_number: v?.intern_number ?? '—',
        document_type_name: typeName.get(h.typeId) ?? '—',
        validity: h.validity,
        days_remaining: h.daysRemaining,
      };
    })
    .sort((a, b) => a.validity.localeCompare(b.validity) || a.domain.localeCompare(b.domain, 'es'));

  const companyDetail = topEmpresa
    .map((h) => ({
      id: h.docId,
      document_type_id: h.typeId,
      document_type_name: typeName.get(h.typeId) ?? '—',
      validity: h.validity,
      // El vencimiento de empresa se guarda como texto DD/MM/YYYY; el motor ya lo normalizó.
      validity_raw: h.validity.split('-').reverse().join('/'),
      days_remaining: h.daysRemaining,
    }))
    .sort(
      (a, b) => a.validity.localeCompare(b.validity) || a.document_type_name.localeCompare(b.document_type_name, 'es')
    );

  return {
    generated_at: now.toLocaleString('sv-SE', { timeZone: ARGENTINA_TIME_ZONE }).replace(' ', 'T'),
    today,
    window_end: addDays(today, daysAhead),
    days_ahead: daysAhead,
    detail_limit: detailLimit,
    expiring_soon: {
      employees: { total: persona.expiring.length, detail: employeeDetail },
      equipment: { total: equipos.expiring.length, detail: equipmentDetail },
      company: { total: empresa.expiring.length, detail: companyDetail },
    },
    expired_counts: {
      employees: persona.expiredCount,
      equipment: equipos.expiredCount,
      company: empresa.expiredCount,
    },
    expired_doc_type_ids: {
      employees: [...persona.expiredTypeIds],
      equipment: [...equipos.expiredTypeIds],
      company: [...empresa.expiredTypeIds],
    },
    pending_counts: {
      employees: persona.missingCount,
      equipment: equipos.missingCount,
      company: empresa.missingCount,
    },
  };
}
