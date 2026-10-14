import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import type { InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { prisma } from '@/shared/lib/prisma';
import { cache } from 'react';
import { normalizePeriod } from '../../shared/compliance/dates';
import {
  DOCUMENT_STATE_RANK,
  loadDocumentEntries,
  periodSearchValues,
  type DocumentEntry,
} from '../../shared/compliance/server/document-entries.server';

/**
 * Filas de las listas de documentos de equipos (permanentes y mensuales), calculadas por el motor de
 * cumplimiento. Misma forma que las filas Prisma que usaban las listas (`vehicles`, `document_types`...)
 * más `isMissing` / `expiringSoon` / `notApplicable`. El id de una fila faltante es
 * `missing:<equipo>:<tipo>[:<período>]`.
 */

const VEHICLE_DISPLAY_SELECT = {
  id: true,
  domain: true,
  serie: true,
  intern_number: true,
  is_active: true,
  year: true,
  chassis: true,
  engine: true,
  type_of_contract: true,
  contract_expiration_date: true,
  // FKs del equipo (para filterFn client-side)
  type: true,
  subType: true,
  brand: true,
  owner_id: true,
  sector: true,
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { id: true, name: true } },
  model_vehicles: { select: { id: true, name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  contractor_equipment: { select: { id: true, customers: { select: { id: true, name: true } } } },
} as const;

type VehicleDisplay = Prisma.vehiclesGetPayload<{ select: typeof VEHICLE_DISPLAY_SELECT }>;

/** Datos de presentación de los equipos: activos de la empresa, o el de la ficha si es una lista embebida. */
const loadVehicleDisplay = cache(async (companyId: string, equipmentId: string) => {
  const vehicles = await prisma.vehicles.findMany({
    where: equipmentId
      ? { id: equipmentId, company_id: companyId }
      : { company_id: companyId, OR: [{ is_active: true }, { is_active: null }] },
    select: VEHICLE_DISPLAY_SELECT,
  });
  return new Map(vehicles.map((v) => [v.id, v]));
});

function toEquipmentDocumentRow(entry: DocumentEntry, vehicle: VehicleDisplay) {
  return {
    id: entry.rowId,
    created_at: entry.doc ? entry.doc.createdAt : null,
    validity: entry.extra ? entry.extra.validityDate : null,
    state: entry.state,
    deny_reason: entry.extra ? entry.extra.denyReason : null,
    policy_number: entry.extra ? entry.extra.policyNumber : null,
    document_path: entry.doc ? entry.doc.path : null,
    period: entry.period,
    applies: entry.resourceId,
    id_document_types: entry.typeId,
    vehicles: vehicle,
    document_types: {
      id: entry.typeId,
      name: entry.typeName,
      mandatory: entry.type.mandatory,
      multiresource: entry.type.multiresource,
      explired: entry.type.hasExpiry,
      is_it_montlhy: entry.type.monthly,
      private: entry.type.isPrivate,
    },
    /** Último movimiento del documento (sólo se completa para la página que se muestra). */
    documents_equipment_logs: [] as Array<{ updated_at: Date }>,
    /** Fila sintética: el tipo es obligatorio y no hay documento. */
    isMissing: entry.isMissing,
    /** Vence dentro de los próximos 30 días. */
    expiringSoon: entry.expiringSoon,
    /** El tipo ya no aplica al equipo (sólo en la ficha del equipo). */
    notApplicable: entry.notApplicable,
  };
}

export type EquipmentDocumentRow = ReturnType<typeof toEquipmentDocumentRow>;

/**
 * Todas las filas de la lista (sin filtros del usuario), una vez por request.
 * `equipmentId` vacío = lista general (equipos activos de la empresa).
 */
export const loadEquipmentDocumentRows = cache(
  async (companyId: string, monthly: boolean, canViewPrivate: boolean, equipmentId: string) => {
    const [{ entries }, vehicles] = await Promise.all([
      loadDocumentEntries(companyId, 'Equipos', monthly, canViewPrivate, equipmentId),
      loadVehicleDisplay(companyId, equipmentId),
    ]);
    const rows: EquipmentDocumentRow[] = [];
    for (const entry of entries) {
      const vehicle = vehicles.get(entry.resourceId);
      if (vehicle) rows.push(toEquipmentDocumentRow(entry, vehicle));
    }
    return rows;
  }
);

/** Completa `documents_equipment_logs` (fecha del último movimiento) de las filas ya paginadas: 1 consulta. */
export async function attachEquipmentDocumentLogs(rows: EquipmentDocumentRow[]): Promise<EquipmentDocumentRow[]> {
  const ids = rows.filter((r) => !r.isMissing).map((r) => r.id);
  if (ids.length === 0) return rows;
  const logs = await prisma.documents_equipment_logs.groupBy({
    by: ['documents_equipment_id'],
    where: { documents_equipment_id: { in: ids } },
    _max: { updated_at: true },
  });
  const latest = new Map(logs.map((l) => [l.documents_equipment_id, l._max.updated_at]));
  return rows.map((row) => {
    const updatedAt = latest.get(row.id);
    return updatedAt ? { ...row, documents_equipment_logs: [{ updated_at: updatedAt }] } : row;
  });
}

function vehicleLabels(row: EquipmentDocumentRow): Array<string | null> {
  return [row.vehicles.domain, row.vehicles.serie, row.vehicles.intern_number];
}

/** Una faceta de un FK nullable del equipo: sin valor = sin entradas (el pipeline lo cuenta como "sin asignar"). */
function optionalEntry(id: string | number | null, name: string | null | undefined) {
  return id === null ? [] : [{ id: String(id), name: name ?? null }];
}

/** `@db.Date` llega como medianoche UTC: se lee como `YYYY-MM-DD` UTC (en hora argentina caería el día anterior). */
function utcDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Búsqueda, filtros, facetas y orden de las listas de equipos. `typeColumnId` es el id de la
 * columna del tipo de documento (`document_type` en permanentes, `documentType` en mensuales).
 */
export function equipmentDocumentSpec(typeColumnId: string): InMemoryTableSpec<EquipmentDocumentRow> {
  return {
    rowId: (row) => row.id,
    search: { contains: (row) => [...vehicleLabels(row), row.document_types.name] },
    textFilters: {
      vehicle: vehicleLabels,
      serie: (row) => [row.vehicles.serie],
      deny_reason: (row) => [row.deny_reason],
      policy_number: (row) => [row.policy_number],
      period: (row) => periodSearchValues(row.period),
      vehicle_year: (row) => [row.vehicles.year],
      vehicle_chassis: (row) => [row.vehicles.chassis],
      vehicle_engine: (row) => [row.vehicles.engine],
    },
    facets: {
      state: (row) => [{ id: row.state }],
      [typeColumnId]: (row) => [{ id: row.id_document_types, name: row.document_types.name }],
      mandatory: (row) => [{ id: String(row.document_types.mandatory) }],
      multiresource: (row) => [{ id: String(row.document_types.multiresource) }],
      contractor: (row) =>
        row.vehicles.contractor_equipment.flatMap((ce) =>
          ce.customers ? [{ id: ce.customers.id, name: ce.customers.name }] : []
        ),
      vehicle_type: (row) => optionalEntry(row.vehicles.type, row.vehicles.type_vehicles_typeTotype?.name),
      vehicle_subtype: (row) => optionalEntry(row.vehicles.subType, row.vehicles.sub_type?.name),
      vehicle_brand: (row) => optionalEntry(row.vehicles.brand, row.vehicles.brand_vehicles?.name),
      vehicle_owner: (row) => optionalEntry(row.vehicles.owner_id, row.vehicles.equipment_owners?.name),
      vehicle_sector: (row) => optionalEntry(row.vehicles.sector, row.vehicles.hierarchy?.name),
      vehicle_contract_type: (row) => optionalEntry(row.vehicles.type_of_contract, null),
    },
    dateRanges: {
      created_at: (row) => row.created_at,
      validity: (row) => row.validity,
      vehicle_contract_expiration: (row) => utcDay(row.vehicles.contract_expiration_date),
    },
    sorters: {
      created_at: (row) => row.created_at,
      validity: (row) => row.validity,
      state: (row) => DOCUMENT_STATE_RANK[row.state],
      period: (row) => normalizePeriod(row.period) ?? row.period,
      policy_number: (row) => row.policy_number,
      vehicle: (row) => row.vehicles.domain ?? row.vehicles.serie ?? row.vehicles.intern_number,
      [typeColumnId]: (row) => row.document_types.name,
      vehicle_type: (row) => row.vehicles.type_vehicles_typeTotype?.name,
      vehicle_subtype: (row) => row.vehicles.sub_type?.name,
      vehicle_brand: (row) => row.vehicles.brand_vehicles?.name,
      vehicle_year: (row) => row.vehicles.year,
      vehicle_owner: (row) => row.vehicles.equipment_owners?.name,
      vehicle_sector: (row) => row.vehicles.hierarchy?.name,
      vehicle_chassis: (row) => row.vehicles.chassis,
      vehicle_engine: (row) => row.vehicles.engine,
      vehicle_contract_type: (row) => row.vehicles.type_of_contract,
      vehicle_contract_expiration: (row) => row.vehicles.contract_expiration_date,
    },
    defaultSort: [
      (row) => row.vehicles.domain ?? row.vehicles.serie ?? row.vehicles.intern_number,
      (row) => row.document_types.name,
    ],
  };
}
