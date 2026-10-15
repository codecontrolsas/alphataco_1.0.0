'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { condition_enum } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { CANCELLED_ROW_STATUS, getOperationToday } from '../lib/dashboard-dates';
import { aggregateEquipmentIndicators, isNotOperative, NOT_OPERATIVE_CONDITIONS } from '../lib/indicators';
import { toFacetMap } from '../lib/row-mapping';
import type { EquipmentIndicatorResult } from './types';

const logger = new Logger('features/Dashboard/Principal/fleet');

/**
 * Condiciones "en servicio" (diálogo "Disponible / Sin asignar"): todas menos las de
 * `NOT_OPERATIVE_CONDITIONS`. Un equipo sin condición también cuenta como en servicio, igual que
 * en el indicador (`aggregateEquipmentIndicators`): una sola definición para los dos.
 */
const AVAILABLE_CONDITIONS: condition_enum[] = Object.values(condition_enum).filter((value) => !isNotOperative(value));
/** Condiciones que dejan a un equipo fuera de servicio (diálogo "Fuera de servicio"). */
const REPAIR_CONDITIONS: condition_enum[] = [...NOT_OPERATIVE_CONDITIONS];

/**
 * Relaciones equipo ↔ parte de HOY de la empresa: los equipos "en operaciones" (sin los servicios
 * cancelados). La usan el indicador y el diálogo de disponibles, así los dos excluyen el mismo
 * conjunto. `includeCancelled` trae todas las filas, para informar aparte las canceladas.
 */
function buildTodayReportVehicleRelationsWhere(
  companyId: string,
  typeIds: readonly string[] | undefined,
  includeCancelled = false
) {
  const typeFilter = typeIds?.length ? { type: { in: [...typeIds] } } : {};
  return {
    equipment_id: { not: null },
    dailyreportrows: {
      status: includeCancelled ? undefined : { not: CANCELLED_ROW_STATUS },
      dailyreport: { date: new Date(getOperationToday()), is_active: true, company_id: companyId },
    },
    vehicles: { is_active: true, company_id: companyId, ...typeFilter },
  } satisfies Prisma.dailyreportequipmentrelationsWhereInput;
}

/**
 * Flota del dashboard principal: indicadores de uso de equipos y las tablas paginadas de los
 * diálogos (disponibles y fuera de servicio).
 *
 * Perímetro: todo sale de `getActiveCompanyId()`; los `typeIds` que manda el cliente sólo
 * acotan más el listado, nunca lo amplían fuera de la empresa activa.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memoizado por request con clave PRIMITIVA: un array de `typeIds` nuevo en cada llamada no
 * reutiliza `cache()` (compara por identidad), un string sí. La clave son los ids ordenados.
 */
const loadEquipmentIndicators = cache(async (typeIdsKey: string): Promise<EquipmentIndicatorResult[]> => {
  logger.debug('Obteniendo indicadores de equipos', { data: { typeIdsKey } });

  try {
    const companyId = await getActiveCompanyId();
    const typeIds = typeIdsKey ? typeIdsKey.split(',') : [];
    const typeFilter = typeIds.length ? { type: { in: typeIds } } : {};

    const [allVehicles, reportRelations] = await Promise.all([
      prisma.vehicles.findMany({
        where: withCompany({ is_active: true, ...typeFilter }, companyId),
        select: { id: true, condition: true, type_vehicles_typeTotype: { select: { name: true } } },
      }),
      prisma.dailyreportequipmentrelations.findMany({
        where: buildTodayReportVehicleRelationsWhere(companyId, typeIds, true),
        select: { equipment_id: true, dailyreportrows: { select: { status: true } } },
      }),
    ]);

    const usedIds = new Set<string>();
    const inCancelledIds = new Set<string>();
    for (const relation of reportRelations) {
      if (!relation.equipment_id) continue;
      if (relation.dailyreportrows?.status === CANCELLED_ROW_STATUS) inCancelledIds.add(relation.equipment_id);
      else usedIds.add(relation.equipment_id);
    }

    return aggregateEquipmentIndicators(allVehicles, usedIds, inCancelledIds);
  } catch (error) {
    logger.error('Error al obtener indicadores de equipos', { data: { error } });
    // Sin dato no hay []: una flota vacía se leería como "no hay equipos".
    throw error;
  }
});

/** Indicador de uso de equipos por tipo. Lanza si no se puede calcular. */
export async function getEquipmentIndicators(typeIds?: string[]): Promise<EquipmentIndicatorResult[]> {
  await requireDashboardView('principal');
  const key = [...new Set(typeIds ?? [])].filter(Boolean).sort().join(',');
  return loadEquipmentIndicators(key);
}

export type EquipmentIndicatorsData = Awaited<ReturnType<typeof getEquipmentIndicators>>;

/**
 * Tipos de vehículo disponibles para el filtro: los de la empresa activa más los globales
 * (`company_id IS NULL`).
 */
const loadAllVehicleTypes = cache(async () => {
  logger.debug('Obteniendo todos los tipos de vehículos');

  try {
    const companyId = await getActiveCompanyId();

    return await prisma.type.findMany({
      where: {
        is_active: true,
        applies_to: 'vehicle',
        OR: [{ company_id: companyId }, { company_id: null }],
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de vehículos', { data: { error } });
    throw error;
  }
});

/** Memoizado por request: las dos secciones de flota lo piden en el mismo render. */
export async function getAllVehicleTypes() {
  await requireDashboardView('principal');
  return loadAllVehicleTypes();
}

export type AllVehicleTypesData = Awaited<ReturnType<typeof getAllVehicleTypes>>;
export type VehicleTypeItem = AllVehicleTypesData[number];

// ─────────────────────────────────────────────────────────────────────────────
// Diálogos — DataTable server-side (disponibles + en reparación)
// ─────────────────────────────────────────────────────────────────────────────

const VEHICLE_TEXT_COLUMNS = ['domain', 'serie', 'intern_number'];
const VALID_VEHICLE_SORT_FIELDS = new Set(['domain', 'serie', 'intern_number', 'condition']);
const VEHICLE_FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicleType: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  subType: (dir) => ({ sub_type: { name: dir } }),
};

const VEHICLE_DIALOG_SELECT = {
  id: true,
  domain: true,
  serie: true,
  intern_number: true,
  condition: true,
  type: true,
  subType: true,
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  contractor_equipment: { select: { customers: { select: { id: true, name: true } } } },
} as const;

/**
 * Filtros del DataTable de los diálogos. La condición del filtro se INTERSECA con `allowedConditions`
 * (las del diálogo): elegir «No operativo» en el diálogo de disponibles no amplía el listado.
 */
function buildVehicleFiltersWhere(
  state: ReturnType<typeof parseSearchParams>,
  allowedConditions: condition_enum[],
  /** El diálogo admite equipos sin condición (los de disponibles, como el indicador). */
  includeNullCondition = false
) {
  const filtersWhere = buildFiltersWhere(
    state.filters,
    { vehicleType: 'type', subType: 'subType' },
    { exclude: [...VEHICLE_TEXT_COLUMNS, 'contractor_equipment', 'condition'] }
  );

  const selectedConditions = (state.filters['condition'] ?? []).filter((value): value is condition_enum =>
    (allowedConditions as string[]).includes(value)
  );

  const wantsNullCondition = includeNullCondition && (state.filters['condition'] ?? []).includes(NULL_FILTER_VALUE);
  const anyConditionSelected = selectedConditions.length > 0 || wantsNullCondition;
  const conditionValues = anyConditionSelected ? selectedConditions : allowedConditions;
  const withNullCondition = includeNullCondition && (!anyConditionSelected || wantsNullCondition);

  const contractorValues = state.filters['contractor_equipment'];
  const extraAndConditions: Record<string, unknown>[] = withNullCondition
    ? [{ OR: [{ condition: null }, { condition: { in: conditionValues } }] }]
    : [];
  const directM2mFilters: Record<string, unknown> = {};

  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((value) => value !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { contractor_equipment: { some: { contractor_id: { in: realValues } } } },
          { contractor_equipment: { none: {} } },
        ],
      });
    } else if (hasNull) {
      directM2mFilters['contractor_equipment'] = { none: {} };
    } else {
      directM2mFilters['contractor_equipment'] = { some: { contractor_id: { in: realValues } } };
    }
  }

  const filtersWhereRecord = filtersWhere as Record<string, unknown> & { AND?: Record<string, unknown>[] };
  const allAndConditions = [...(filtersWhereRecord.AND ?? []), ...extraAndConditions];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhereRecord;

  return {
    ...buildSearchWhere(state.search, VEHICLE_TEXT_COLUMNS),
    ...(withNullCondition ? {} : { condition: { in: conditionValues } }),
    ...filtersWhereWithoutAnd,
    ...buildTextFiltersWhere(state.filters, VEHICLE_TEXT_COLUMNS),
    ...directM2mFilters,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
  };
}

async function buildAvailableVehiclesWhereClause(
  companyId: string,
  typeIds: string[] | undefined,
  state: ReturnType<typeof parseSearchParams>
) {
  const vehiclesInReport = await prisma.dailyreportequipmentrelations.findMany({
    where: buildTodayReportVehicleRelationsWhere(companyId, typeIds),
    select: { equipment_id: true },
    distinct: ['equipment_id'],
  });

  const inReportIds = vehiclesInReport.map((row) => row.equipment_id).filter((id): id is string => id != null);

  // Con `typeIds` (unidades motoras) el filtro por tipo del usuario se intersecta con ellos; sin tipos
  // válidos elegidos queda el conjunto completo del diálogo.
  const selectedTypes = (state.filters['vehicleType'] ?? []).filter(
    (value) => value !== NULL_FILTER_VALUE && typeIds?.includes(value)
  );
  const scopedTypes = typeIds?.length ? (selectedTypes.length > 0 ? selectedTypes : typeIds) : null;

  // Los filtros del usuario van primero: lo que define el diálogo (empresa, activos, no están en el parte)
  // se aplica DESPUÉS y no se puede pisar desde la URL.
  return {
    ...buildVehicleFiltersWhere(state, AVAILABLE_CONDITIONS, true),
    is_active: true,
    company_id: companyId,
    ...(scopedTypes ? { type: { in: scopedTypes } } : {}),
    ...(inReportIds.length > 0 ? { id: { notIn: inReportIds } } : {}),
  };
}

function buildRepairVehiclesWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  return {
    ...buildVehicleFiltersWhere(state, REPAIR_CONDITIONS),
    is_active: true,
    company_id: companyId,
  };
}

function buildVehicleOrderBy(state: ReturnType<typeof parseSearchParams>) {
  const resolvedSorts: Record<string, unknown>[] = [];
  for (const sort of state.sorting) {
    if (!VALID_VEHICLE_SORT_FIELDS.has(sort.id)) continue;
    const dir: 'asc' | 'desc' = sort.desc ? 'desc' : 'asc';
    const fkMapper = VEHICLE_FK_SORT_MAP[sort.id];
    resolvedSorts.push(fkMapper ? fkMapper(dir) : { [sort.id]: dir });
  }
  return [...resolvedSorts, { domain: 'asc' as const }];
}

type VehicleWhere = Prisma.vehiclesWhereInput;

/**
 * Facetas de los diálogos de equipos. `buildWhere` es el `crossWhere` ya armado por el
 * llamador (disponibles o en reparación), así que la lógica de cada columna se escribe
 * una sola vez para los dos diálogos.
 */
async function getVehicleFacet(
  columnId: string,
  buildWhere: (excludeColumn: string) => Promise<VehicleWhere> | VehicleWhere
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (columnId === 'vehicleType') {
    const where = await buildWhere('vehicleType');
    const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: true });
    const ids = rows.map((row) => row.type).filter((id): id is string => id != null);
    const resolvedOptions =
      ids.length > 0
        ? await prisma.type.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
    return { counts: toFacetMap(rows.map((row) => ({ key: row.type, count: row._count }))), resolvedOptions };
  }

  if (columnId === 'subType') {
    const where = await buildWhere('subType');
    const rows = await prisma.vehicles.groupBy({ by: ['subType'], where, _count: true });
    const ids = rows.map((row) => row.subType).filter((id): id is string => id != null);
    const resolvedOptions =
      ids.length > 0
        ? await prisma.sub_type.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
    return { counts: toFacetMap(rows.map((row) => ({ key: row.subType, count: row._count }))), resolvedOptions };
  }

  if (columnId === 'condition') {
    const where = await buildWhere('condition');
    const rows = await prisma.vehicles.groupBy({ by: ['condition'], where, _count: true });
    return { counts: toFacetMap(rows.map((row) => ({ key: row.condition, count: row._count }))) };
  }

  if (columnId === 'contractor_equipment') {
    const where = await buildWhere('contractor_equipment');
    const [distinctRelations, allRelations, totalInCross, withSome] = await Promise.all([
      prisma.contractor_equipment.findMany({
        where: { vehicles: where },
        select: { contractor_id: true, customers: { select: { id: true, name: true } } },
        distinct: ['contractor_id'],
      }),
      prisma.contractor_equipment.findMany({ where: { vehicles: where }, select: { contractor_id: true } }),
      prisma.vehicles.count({ where }),
      prisma.vehicles.count({ where: { ...where, contractor_equipment: { some: {} } } }),
    ]);

    const counts = new Map<string, number>();
    for (const relation of allRelations) {
      if (relation.contractor_id) counts.set(relation.contractor_id, (counts.get(relation.contractor_id) ?? 0) + 1);
    }
    const unassigned = totalInCross - withSome;
    if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);

    return {
      counts,
      resolvedOptions: distinctRelations
        .filter((relation) => relation.contractor_id && relation.customers)
        .map((relation) => ({ id: relation.customers!.id, name: relation.customers!.name })),
    };
  }

  return null;
}

export async function getAvailableVehiclesPaginated(searchParams: DataTableSearchParams, typeIds?: string[]) {
  await requireDashboardView('principal');
  // Fuera del try a propósito: una sesión sin empresa activa es un error de sesión, no
  // "no hay datos" — el catch de abajo es para fallas de la query.
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo vehículos disponibles paginados', { data: { typeIds } });

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = (await buildAvailableVehiclesWhereClause(companyId, typeIds, state)) as VehicleWhere;

    const [data, total] = await Promise.all([
      prisma.vehicles.findMany({
        skip,
        take,
        orderBy: buildVehicleOrderBy(state),
        where,
        select: VEHICLE_DIALOG_SELECT,
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener vehículos disponibles paginados', { data: { error } });
    throw error;
  }
}

export type AvailableVehicleItem = Awaited<ReturnType<typeof getAvailableVehiclesPaginated>>['data'][number];

/** Tope de filas de las exportaciones de los diálogos. */
const EXPORT_LIMIT = 10_000;

function vehiclesTooLargeMessage(maxRows: number) {
  return `Hay más de ${maxRows.toLocaleString('es-AR')} equipos con los filtros actuales. Acote la exportación con filtros.`;
}

async function exportVehicles(companyId: string, where: VehicleWhere) {
  const orderBy = [{ domain: 'asc' as const }, { id: 'asc' as const }];

  return fetchExportRowsInBatches({
    maxRows: EXPORT_LIMIT,
    listIds: (take) => prisma.vehicles.findMany({ where, orderBy, select: { id: true }, take }),
    fetchByIds: (ids) =>
      prisma.vehicles.findMany({
        where: { id: { in: ids }, company_id: companyId },
        select: VEHICLE_DIALOG_SELECT,
      }),
    tooLargeMessage: vehiclesTooLargeMessage,
  });
}

export async function getAvailableVehiclesForExport(
  searchParams: DataTableSearchParams,
  typeIds?: string[]
): Promise<ExportResult<AvailableVehicleItem[]>> {
  await requireDashboardView('principal');
  const companyId = await getActiveCompanyId();
  logger.debug('Exportando vehículos disponibles', { data: { typeIds } });

  try {
    const state = parseSearchParams(searchParams);
    const where = (await buildAvailableVehiclesWhereClause(companyId, typeIds, state)) as VehicleWhere;

    return { ok: true, data: await exportVehicles(companyId, where) };
  } catch (error) {
    logger.error('Error al exportar vehículos disponibles', { data: { error } });
    // Next enmascara el mensaje de un error lanzado desde una server action: se devuelve como resultado.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de equipos. Intente nuevamente.',
    };
  }
}

export async function getAvailableVehicleSingleFacet(
  columnId: string,
  typeIds: string[] | undefined,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  await requireDashboardView('principal');
  // Fuera del try: sin empresa activa el filtro NO debe verse como "no hay opciones".
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo facet de vehículos disponibles', { data: { columnId } });

  try {
    const parsedState = parseSearchParams(searchParams && Object.keys(searchParams).length > 0 ? searchParams : {});

    const result = await getVehicleFacet(columnId, async (excludeColumn) => {
      const modified = { ...parsedState, filters: { ...parsedState.filters } };
      delete modified.filters[excludeColumn];
      return (await buildAvailableVehiclesWhereClause(companyId, typeIds, modified)) as VehicleWhere;
    });

    if (!result) logger.warn('Available vehicle facet column not recognized', { data: { columnId } });
    return result;
  } catch (error) {
    logger.error('Error al obtener facet de vehículos disponibles', { data: { error, columnId } });
    return null;
  }
}

export async function getRepairVehiclesPaginated(searchParams: DataTableSearchParams) {
  await requireDashboardView('principal');
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo vehículos en reparación paginados');

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildRepairVehiclesWhereClause(companyId, state) as VehicleWhere;

    const [data, total] = await Promise.all([
      prisma.vehicles.findMany({
        skip,
        take,
        orderBy: buildVehicleOrderBy(state),
        where,
        select: VEHICLE_DIALOG_SELECT,
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener vehículos en reparación paginados', { data: { error } });
    throw error;
  }
}

export type RepairVehicleItem = Awaited<ReturnType<typeof getRepairVehiclesPaginated>>['data'][number];

export async function getRepairVehiclesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<RepairVehicleItem[]>> {
  await requireDashboardView('principal');
  const companyId = await getActiveCompanyId();
  logger.debug('Exportando vehículos en reparación');

  try {
    const state = parseSearchParams(searchParams);
    const where = buildRepairVehiclesWhereClause(companyId, state) as VehicleWhere;

    return { ok: true, data: await exportVehicles(companyId, where) };
  } catch (error) {
    logger.error('Error al exportar vehículos en reparación', { data: { error } });
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de equipos. Intente nuevamente.',
    };
  }
}

export async function getRepairVehicleSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  await requireDashboardView('principal');
  // Fuera del try: sin empresa activa el filtro NO debe verse como "no hay opciones".
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo facet de vehículos en reparación', { data: { columnId } });

  try {
    const parsedState = parseSearchParams(searchParams && Object.keys(searchParams).length > 0 ? searchParams : {});

    const result = await getVehicleFacet(columnId, (excludeColumn) => {
      const modified = { ...parsedState, filters: { ...parsedState.filters } };
      delete modified.filters[excludeColumn];
      return buildRepairVehiclesWhereClause(companyId, modified) as VehicleWhere;
    });

    if (!result) logger.warn('Repair vehicle facet column not recognized', { data: { columnId } });
    return result;
  } catch (error) {
    logger.error('Error al obtener facet de vehículos en reparación', { data: { error, columnId } });
    return null;
  }
}
