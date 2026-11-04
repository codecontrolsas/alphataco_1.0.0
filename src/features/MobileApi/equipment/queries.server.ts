import 'server-only';

import { arToday, daysUntil } from '@/features/Documentacion/shared/compliance/dates';
import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';
import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import type { Prisma } from '@/generated/prisma/client';
import { prismaBase } from '@/shared/lib/prisma';
import { runInTenantScope, runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';
import {
  conditionLabels,
  contractTypeVehiclesLabels,
  employeeStatusLabels,
  terminationReasonEquipmentLabels,
} from '@/shared/utils/mappers';
import { z } from 'zod';
import { EQUIPMENT_CONDITIONS, type EquipmentKind, type EquipmentListQuery } from '../contracts/equipment';
import { loadMobileDocumentRows } from '../documents/queries.server';
import { labeledState, type MobileDocumentRow } from '../documents/rows';
import { InvalidCursorError, conditionOf, decodeCursor, docStatusOf, encodeCursor, isoDay } from '../lib/labels';
import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';
import type { EmployeeAccess } from '../employees/access';
import type { EquipmentAccess, EquipmentKindAccess } from './access';
import {
  documentCountsOrEmpty,
  loadDrivers,
  loadMaintenance,
  loadOtherCertificationCounts,
  loadVehicleDocumentCounts,
} from './enrichment.server';

/**
 * Consultas de Equipos para la API móvil. Corren con el contexto de la petición (RLS por empresa con el rol de
 * aplicación) Y filtran por `company_id` explícito (defensa en profundidad). El perímetro de cada listado es el de la
 * web: vehículos con `type_of_vehicle = 1` (`vehicle-list-shared.ts`) y equipamiento de `other_equipment`
 * (`other-equipment-where.ts`), activos o dados de baja.
 *
 * Los tipos de equipamiento ocultos por rol (ticket 690) NO se aplican: en la web solo los usa Mantenimiento.
 */

const label = (value: string | null | undefined, labels: Record<string, string>) =>
  value ? labels[value] ?? value : null;

const blank = (value: string | null | undefined) => (value && value.trim() !== '' ? value : null);

// ─── Listado ──────────────────────────────────────────────────────────────────

const cursorSchema = z.object({ k: z.enum(['vehicle', 'other']), v: z.string().nullable(), id: z.string().uuid() });

/**
 * Keyset sobre una columna de texto NULLABLE ordenada con `nulls: 'last'`: después de un valor vienen los mayores, los
 * iguales con id mayor y TODOS los null; después de un null, solo los null con id mayor.
 */
function afterNullable(field: string, value: string | null, id: string) {
  if (value === null) return { [field]: null, id: { gt: id } };
  return { OR: [{ [field]: { gt: value } }, { [field]: value, id: { gt: id } }, { [field]: null }] };
}

/** Palabras de la búsqueda; cada una debe aparecer en algún campo. Una patente se busca también sin espacios ni guiones. */
function searchWords(q: string | undefined): string[] {
  return (q ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

function wordVariants(word: string): string[] {
  const compact = word.replace(/[\s.\-/]/g, '');
  return compact && compact !== word ? [word, compact] : [word];
}

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

function vehicleWhere(companyId: string, query: EquipmentListQuery, showDocStatus: boolean): Prisma.vehiclesWhereInput {
  const conditions: Prisma.vehiclesWhereInput[] = [
    { company_id: companyId },
    { is_active: query.status === 'active' },
    { type_of_vehicle: 1 },
  ];
  for (const word of searchWords(query.q)) {
    conditions.push({
      OR: wordVariants(word).flatMap((variant) => [
        { domain: contains(variant) },
        { intern_number: contains(variant) },
        { serie: contains(variant) },
        { chassis: contains(variant) },
        { brand_vehicles: { name: contains(variant) } },
        { model_vehicles: { name: contains(variant) } },
      ]),
    });
  }
  if (query.typeId) conditions.push({ type: query.typeId });
  if (query.condition) conditions.push({ condition: query.condition });
  // Con `documentacion` apagado el estado documental guardado está congelado: no se filtra por él.
  if (query.docStatus && showDocStatus) conditions.push({ status: query.docStatus });
  return { AND: conditions };
}

function otherWhere(
  companyId: string,
  query: EquipmentListQuery,
  showDocStatus: boolean
): Prisma.other_equipmentWhereInput {
  const conditions: Prisma.other_equipmentWhereInput[] = [
    { company_id: companyId },
    { is_active: query.status === 'active' },
  ];
  for (const word of searchWords(query.q)) {
    conditions.push({
      OR: wordVariants(word).flatMap((variant) => [
        { intern_number: contains(variant) },
        { serial_number: contains(variant) },
        { manufacturer_plate: contains(variant) },
        { brand_vehicles: { name: contains(variant) } },
        { model_vehicles: { name: contains(variant) } },
      ]),
    });
  }
  if (query.typeId) conditions.push({ type_id: query.typeId });
  if (query.condition) conditions.push({ condition: query.condition });
  if (query.docStatus && showDocStatus) conditions.push({ status: query.docStatus });
  return { AND: conditions };
}

const LIST_NAME = { select: { name: true } } as const;
/** Clientes afectados: la lista completa y el primero (`customer`). */
function customersOf(customers: ({ id: string; name: string } | null)[]) {
  const list = customers.flatMap((customer) => (customer ? [customer] : []));
  return { customers: list, customer: list[0]?.name ?? null };
}

/**
 * Tarjetas de la lista (primera página): sobre el universo de la clase, el estado, el tipo y la búsqueda; sin
 * `condition` ni `docStatus`, para que cada tarjeta pueda usarse de filtro. Dos conteos agrupados por consulta.
 */
async function equipmentTotals(
  tx: Prisma.TransactionClient,
  companyId: string,
  query: EquipmentListQuery,
  showDocStatus: boolean
) {
  const universe = { ...query, condition: undefined, docStatus: undefined };
  const where = query.kind === 'vehicle' ? vehicleWhere(companyId, universe, false) : otherWhere(companyId, universe, false);
  const [byCondition, withExpiry] =
    query.kind === 'vehicle'
      ? await Promise.all([
          tx.vehicles.groupBy({ by: ['condition'], where: where as Prisma.vehiclesWhereInput, _count: { _all: true } }),
          showDocStatus
            ? tx.vehicles.count({ where: { AND: [where as Prisma.vehiclesWhereInput, { status: 'Completo_con_doc_vencida' }] } })
            : Promise.resolve(null),
        ])
      : await Promise.all([
          tx.other_equipment.groupBy({
            by: ['condition'],
            where: where as Prisma.other_equipmentWhereInput,
            _count: { _all: true },
          }),
          showDocStatus
            ? tx.other_equipment.count({
                where: { AND: [where as Prisma.other_equipmentWhereInput, { status: 'Completo_con_doc_vencida' }] },
              })
            : Promise.resolve(null),
        ]);
  const count = (condition: string) => byCondition.find((row) => row.condition === condition)?._count._all ?? 0;
  return {
    all: byCondition.reduce((sum, row) => sum + row._count._all, 0),
    operative: count('operativo'),
    inWorkshop: count('en_reparacion'),
    withExpiry,
  };
}

/** Página del listado de UNA clase de equipo, paginada por cursor (dominio o interno, nulls al final, id). */
export async function listEquipment(
  ctx: TenantContext,
  query: EquipmentListQuery,
  access: EquipmentAccess,
  employees: EmployeeAccess
) {
  const cursor = decodeCursor(query.cursor, cursorSchema);
  if (cursor && cursor.k !== query.kind) throw new InvalidCursorError('El cursor es de otra clase de equipo');
  const enabled = await getEnabledModulesFor(ctx.companyId);
  const showDocStatus = enabled.has('documentacion');
  // Resumen documental de vehículos activos (motor de la web): una pasada para toda la página, solo con permiso.
  const vehicleCounts =
    query.kind === 'vehicle' && query.status === 'active' && showDocStatus
      ? await loadVehicleDocumentCounts(ctx, access)
      : null;
  const withDrivers = query.kind === 'vehicle' && query.status === 'active' && access.reports && enabled.has('operaciones');
  const withMaintenance = query.kind === 'vehicle' && access.vehicle.maintenance && enabled.has('mantenimiento');
  const withCertificationCounts = query.kind === 'other' && access.other.certifications;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    if (query.kind === 'vehicle') {
      const where = vehicleWhere(ctx.companyId, query, showDocStatus);
      const pageWhere = cursor ? { AND: [where, afterNullable('domain', cursor.v, cursor.id)] } : where;
      const [rows, total] = await Promise.all([
        tx.vehicles.findMany({
          where: pageWhere,
          orderBy: [{ domain: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          take: query.limit + 1,
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            year: true,
            condition: true,
            is_active: true,
            status: true,
            kilometer: true,
            engine_hours: true,
            type_vehicles_typeTotype: LIST_NAME,
            brand_vehicles: LIST_NAME,
            model_vehicles: LIST_NAME,
            cost_center: LIST_NAME,
            contractor_equipment: CUSTOMERS,
          },
        }),
        cursor ? Promise.resolve(null) : tx.vehicles.count({ where }),
      ]);
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const ids = page.map((row) => row.id);
      const [drivers, maintenance, totals] = await Promise.all([
        withDrivers ? loadDrivers(tx, ctx, ids, employees) : null,
        withMaintenance ? loadMaintenance(tx, ctx.companyId, ids) : null,
        cursor ? Promise.resolve(null) : equipmentTotals(tx, ctx.companyId, query, showDocStatus),
      ]);
      return {
        totals,
        items: page.map((row) => ({
          id: row.id,
          kind: 'vehicle' as const,
          identifier: row.domain ?? row.serie ?? row.intern_number ?? row.id,
          domain: row.domain,
          internNumber: row.intern_number,
          serialNumber: row.serie,
          type: row.type_vehicles_typeTotype?.name ?? null,
          brand: row.brand_vehicles?.name ?? null,
          model: row.model_vehicles?.name ?? null,
          year: blank(row.year),
          condition: conditionOf(row.condition),
          isActive: row.is_active !== false,
          docStatus: showDocStatus ? docStatusOf(row.status) : null,
          plate: row.domain,
          mileage: blank(row.kilometer),
          engineHours: blank(row.engine_hours),
          ...customersOf(row.contractor_equipment.map((item) => item.customers)),
          costCenter: row.cost_center?.name ?? null,
          ...(drivers ? { driver: drivers.get(row.id) ?? null } : {}),
          ...(vehicleCounts ? { documentSummary: documentCountsOrEmpty(vehicleCounts, row.id) } : {}),
          ...(maintenance ? { maintenance: maintenance.get(row.id) ?? null } : {}),
        })),
        nextCursor:
          rows.length > query.limit && last ? encodeCursor({ k: 'vehicle', v: last.domain, id: last.id }) : null,
        total,
      };
    }

    const where = otherWhere(ctx.companyId, query, showDocStatus);
    const pageWhere = cursor ? { AND: [where, afterNullable('intern_number', cursor.v, cursor.id)] } : where;
    const [rows, total] = await Promise.all([
      tx.other_equipment.findMany({
        where: pageWhere,
        orderBy: [{ intern_number: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        take: query.limit + 1,
        select: {
          id: true,
          intern_number: true,
          serial_number: true,
          year: true,
          condition: true,
          is_active: true,
          status: true,
          horometer: true,
          type: LIST_NAME,
          brand_vehicles: LIST_NAME,
          model_vehicles: LIST_NAME,
          cost_center: LIST_NAME,
          contractor_other_equipment: CUSTOMERS,
        },
      }),
      cursor ? Promise.resolve(null) : tx.other_equipment.count({ where }),
    ]);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const [certificationCounts, totals] = await Promise.all([
      withCertificationCounts ? loadOtherCertificationCounts(tx, ctx.companyId, page.map((row) => row.id)) : null,
      cursor ? Promise.resolve(null) : equipmentTotals(tx, ctx.companyId, query, showDocStatus),
    ]);
    return {
      totals,
      items: page.map((row) => ({
        id: row.id,
        kind: 'other' as const,
        identifier: row.intern_number ?? row.serial_number ?? row.id,
        domain: null,
        internNumber: row.intern_number,
        serialNumber: row.serial_number,
        type: row.type?.name ?? null,
        brand: row.brand_vehicles?.name ?? null,
        model: row.model_vehicles?.name ?? null,
        year: blank(row.year),
        condition: conditionOf(row.condition),
        isActive: row.is_active,
        docStatus: showDocStatus ? docStatusOf(row.status) : null,
        // Equipamiento sin patente: se lo nombra por interno o n° de serie.
        plate: null,
        mileage: null,
        engineHours: row.horometer === null ? null : row.horometer.toString(),
        ...customersOf(row.contractor_other_equipment.map((item) => item.customers)),
        costCenter: row.cost_center?.name ?? null,
        ...(certificationCounts ? { documentSummary: documentCountsOrEmpty(certificationCounts, row.id) } : {}),
      })),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ k: 'other', v: last.intern_number, id: last.id }) : null,
      total,
    };
  });
}

/** Opciones de los filtros: clases y estados permitidos, tipos de la empresa, condiciones y estados documentales. */
export async function getEquipmentFilterOptions(ctx: TenantContext, access: EquipmentAccess) {
  const showDocStatus = await isModuleEnabledForCompany('documentacion', ctx.companyId);
  const types = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.type.findMany({
      where: { company_id: ctx.companyId, is_active: true },
      select: { id: true, name: true, applies_to: true },
      orderBy: { name: 'asc' },
    })
  );
  const statuses = (kind: EquipmentKindAccess) => [
    ...(kind.listActive ? [{ value: 'active' as const, label: 'Activos' }] : []),
    ...(kind.listInactive ? [{ value: 'inactive' as const, label: 'Dados de baja' }] : []),
  ];
  const kinds = [
    { value: 'vehicle' as const, label: 'Vehículos', statuses: statuses(access.vehicle) },
    { value: 'other' as const, label: 'Equipamiento', statuses: statuses(access.other) },
  ].filter((kind) => kind.statuses.length > 0);
  const visibleKinds = new Set(kinds.map((kind) => kind.value));
  return {
    kinds,
    // `applies_to`: 'vehicle' u 'other_equipment' (null = vehículo, el default de la columna).
    types: types.flatMap((type) => {
      const kind: EquipmentKind = type.applies_to === 'other_equipment' ? 'other' : 'vehicle';
      return visibleKinds.has(kind) ? [{ id: type.id, name: type.name, kind }] : [];
    }),
    conditions: EQUIPMENT_CONDITIONS.map((value) => ({ value, label: conditionLabels[value] ?? value })),
    docStatuses: showDocStatus
      ? Object.entries(employeeStatusLabels).map(([value, text]) => ({ value, label: text }))
      : [],
  };
}

// ─── Ficha ────────────────────────────────────────────────────────────────────

const NAME = { select: { name: true } } as const;
const OWNER = { select: { name: true, cuit: true } } as const;
const CUSTOMERS = { select: { customers: { select: { id: true, name: true } } } } as const;

/** Documento de la ficha del vehículo (fila del motor ya normalizada). */
function toEquipmentDocument(row: MobileDocumentRow) {
  return {
    id: row.id,
    type: row.type.name,
    monthly: row.type.monthly,
    mandatory: row.type.mandatory,
    status: row.status,
    state: labeledState(row.state),
    validity: row.validity,
    period: row.period,
    hasDetail: !row.isMissing,
  };
}

const STATUS_RANK: Record<string, number> = { missing: 0, rejected: 1, expired: 2, expiring: 3, valid: 4 };

/** Documentación del vehículo con el mismo motor que la ficha web (permanentes y mensuales según permisos). */
async function vehicleDocuments(ctx: TenantContext, vehicleId: string, access: EquipmentKindAccess['documents']) {
  const load = (monthly: boolean) =>
    loadMobileDocumentRows(
      ctx,
      { resource: 'equipment', monthly, privateTypes: access.privateTypes, resourceId: vehicleId },
      ''
    );
  const [permanentRows, monthlyRows] = await runInTenantScope(ctx, () =>
    Promise.all([
      access.permanent ? load(false) : Promise.resolve(null),
      access.monthly ? load(true) : Promise.resolve(null),
    ])
  );
  const sort = (rows: MobileDocumentRow[]) =>
    rows
      .map(toEquipmentDocument)
      .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || a.type.localeCompare(b.type, 'es'));
  const permanent = permanentRows ? sort(permanentRows) : null;
  const monthly = monthlyRows ? sort(monthlyRows) : null;
  const all = [...(permanent ?? []), ...(monthly ?? [])];
  return {
    permanent,
    monthly,
    summary: {
      total: all.length,
      missing: all.filter((doc) => doc.status === 'missing').length,
      expired: all.filter((doc) => doc.status === 'expired').length,
      expiringSoon: all.filter((doc) => doc.status === 'expiring').length,
    },
  };
}

/** Estado de un documento de equipamiento por su vencimiento (hora argentina, mismo umbral que la web). */
function certificationStatus(expiration: string | null): 'valid' | 'expiring' | 'expired' {
  if (!expiration) return 'valid';
  const days = daysUntil(expiration, arToday());
  if (days < 0) return 'expired';
  return days <= EXPIRING_SOON_DAYS ? 'expiring' : 'valid';
}

/** Conteo por estado de los documentos de la ficha (`missing`/`rejected` solo existen en los vehículos). */
const countsOf = (docs: { status: string }[]) => {
  const count = (status: string) => docs.filter((doc) => doc.status === status).length;
  return {
    valid: count('valid'),
    expiring: count('expiring'),
    expired: count('expired'),
    missing: count('missing'),
    rejected: count('rejected'),
  };
};

const contractOf = (row: {
  type_of_contract: string | null;
  contract_number: string | null;
  contract_start_date: Date | null;
  contract_expiration_date: Date | null;
}) => ({
  type: label(row.type_of_contract, contractTypeVehiclesLabels),
  number: blank(row.contract_number),
  startDate: isoDay(row.contract_start_date),
  expirationDate: isoDay(row.contract_expiration_date),
});

const certificationOf = (row: {
  has_certification: boolean;
  certification_number: string | null;
  certification_expiration_date: Date | null;
}) => ({
  has: row.has_certification,
  number: row.has_certification ? blank(row.certification_number) : null,
  expirationDate: row.has_certification ? isoDay(row.certification_expiration_date) : null,
});

/** Ficha de un equipo de la empresa con los bloques que el usuario puede ver. null = no existe en la empresa. */
export async function getEquipmentDetail(
  ctx: TenantContext,
  kind: EquipmentKind,
  id: string,
  access: EquipmentAccess,
  employees: EmployeeAccess
) {
  const kindAccess = access[kind];
  const enabled = await getEnabledModulesFor(ctx.companyId);
  const documentacion = enabled.has('documentacion');

  if (kind === 'vehicle') {
    const v = await runWithTenantContext(prismaBase, ctx, (tx) =>
      tx.vehicles.findFirst({
        where: { id, company_id: ctx.companyId },
        select: {
          id: true,
          domain: true,
          serie: true,
          intern_number: true,
          chassis: true,
          engine: true,
          year: true,
          kilometer: true,
          engine_hours: true,
          condition: true,
          is_active: true,
          status: true,
          termination_date: true,
          reason_for_termination: true,
          type_of_contract: true,
          contract_number: true,
          contract_start_date: true,
          contract_expiration_date: true,
          has_certification: true,
          certification_number: true,
          certification_expiration_date: true,
          type_vehicles_typeTotype: NAME,
          sub_type: NAME,
          brand_vehicles: NAME,
          model_vehicles: NAME,
          equipment_owners: OWNER,
          hierarchy: NAME,
          cost_center: NAME,
          contractor_equipment: CUSTOMERS,
        },
      })
    );
    if (!v) return null;
    const isActive = v.is_active !== false;
    const documents =
      documentacion && kindAccess.documents.visible ? await vehicleDocuments(ctx, v.id, kindAccess.documents) : null;
    // Revisión 2: chofer (partes diarios) y mantenimiento, solo con permiso y módulo.
    const [driver, maintenance] = await runWithTenantContext(prismaBase, ctx, (tx) =>
      Promise.all([
        isActive && access.reports && enabled.has('operaciones') ? loadDrivers(tx, ctx, [v.id], employees) : null,
        access.vehicle.maintenance && enabled.has('mantenimiento') ? loadMaintenance(tx, ctx.companyId, [v.id]) : null,
      ])
    );
    return {
      id: v.id,
      kind,
      plate: v.domain,
      ...(driver ? { driver: driver.get(v.id) ?? null } : {}),
      ...(maintenance ? { maintenance: maintenance.get(v.id) ?? null } : {}),
      ...(documents ? { documentSummary: countsOf([...(documents.permanent ?? []), ...(documents.monthly ?? [])]) } : {}),
      identifier: v.domain ?? v.serie ?? v.intern_number ?? v.id,
      isActive,
      condition: conditionOf(v.condition),
      docStatus: documentacion ? docStatusOf(v.status) : null,
      termination: isActive
        ? null
        : { date: isoDay(v.termination_date), reason: label(v.reason_for_termination, terminationReasonEquipmentLabels) },
      ...(kindAccess.technical
        ? {
            technical: {
              type: v.type_vehicles_typeTotype?.name ?? null,
              subtype: v.sub_type?.name ?? null,
              brand: v.brand_vehicles?.name ?? null,
              model: v.model_vehicles?.name ?? null,
              year: blank(v.year),
              domain: v.domain,
              internNumber: blank(v.intern_number),
              serialNumber: blank(v.serie),
              chassis: blank(v.chassis),
              engine: blank(v.engine),
              kilometer: blank(v.kilometer),
              engineHours: blank(v.engine_hours),
              horometer: null,
              manufacturerPlate: null,
              linkedVehicle: null,
              owner: v.equipment_owners ? { name: v.equipment_owners.name, cuit: blank(v.equipment_owners.cuit) } : null,
              contract: contractOf(v),
              certification: certificationOf(v),
            },
          }
        : {}),
      ...(kindAccess.assignment
        ? {
            assignment: {
              customers: v.contractor_equipment.flatMap((item) => (item.customers ? [item.customers] : [])),
              sector: v.hierarchy?.name ?? null,
              costCenter: v.cost_center?.name ?? null,
            },
          }
        : {}),
      documents,
      certifications: null,
    };
  }

  const e = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.other_equipment.findFirst({
      where: { id, company_id: ctx.companyId },
      select: {
        id: true,
        intern_number: true,
        serial_number: true,
        year: true,
        horometer: true,
        manufacturer_plate: true,
        condition: true,
        is_active: true,
        status: true,
        termination_date: true,
        reason_for_termination: true,
        type_of_contract: true,
        contract_number: true,
        contract_start_date: true,
        contract_expiration_date: true,
        has_certification: true,
        certification_number: true,
        certification_expiration_date: true,
        type: NAME,
        sub_type: NAME,
        brand_vehicles: NAME,
        model_vehicles: NAME,
        equipment_owners: OWNER,
        hierarchy: NAME,
        cost_center: NAME,
        vehicles: { select: { id: true, domain: true } },
        contractor_other_equipment: CUSTOMERS,
        other_equipment_certifications: {
          select: { id: true, name: true, expiration_date: true },
          orderBy: [{ expiration_date: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        },
      },
    })
  );
  if (!e) return null;
  const certifications = kindAccess.certifications
    ? e.other_equipment_certifications.map((cert) => {
        const expirationDate = isoDay(cert.expiration_date);
        return { id: cert.id, name: cert.name, expirationDate, status: certificationStatus(expirationDate) };
      })
    : null;
  return {
    id: e.id,
    kind,
    // Equipamiento sin patente: se lo nombra por `identifier` (interno o n° de serie).
    plate: null,
    ...(certifications ? { documentSummary: countsOf(certifications) } : {}),
    identifier: e.intern_number ?? e.serial_number ?? e.id,
    isActive: e.is_active,
    condition: conditionOf(e.condition),
    docStatus: documentacion ? docStatusOf(e.status) : null,
    termination: e.is_active
      ? null
      : { date: isoDay(e.termination_date), reason: label(e.reason_for_termination, terminationReasonEquipmentLabels) },
    ...(kindAccess.technical
      ? {
          technical: {
            type: e.type?.name ?? null,
            subtype: e.sub_type?.name ?? null,
            brand: e.brand_vehicles?.name ?? null,
            model: e.model_vehicles?.name ?? null,
            year: blank(e.year),
            domain: null,
            internNumber: blank(e.intern_number),
            serialNumber: blank(e.serial_number),
            chassis: null,
            engine: null,
            kilometer: null,
            engineHours: null,
            horometer: e.horometer === null ? null : e.horometer.toString(),
            manufacturerPlate: blank(e.manufacturer_plate),
            linkedVehicle: e.vehicles ? { id: e.vehicles.id, domain: e.vehicles.domain } : null,
            owner: e.equipment_owners ? { name: e.equipment_owners.name, cuit: blank(e.equipment_owners.cuit) } : null,
            contract: contractOf(e),
            certification: certificationOf(e),
          },
        }
      : {}),
    ...(kindAccess.assignment
      ? {
          assignment: {
            customers: e.contractor_other_equipment.map((item) => item.customers),
            sector: e.hierarchy?.name ?? null,
            costCenter: e.cost_center?.name ?? null,
          },
        }
      : {}),
    documents: null,
    certifications,
  };
}
