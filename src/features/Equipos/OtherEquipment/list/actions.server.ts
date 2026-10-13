'use server';

import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('OtherEquipment/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de other_equipment que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'serial_number',
  'intern_number',
  'year',
  'condition',
  'status',
  'horometer',
  'manufacturer_plate',
  'composition',
  'invoice_number',
  'initial_value',
  'currency',
  'purchase_date',
  'cost_type',
  'type_of_contract',
  'reason_for_termination',
  'termination_date',
  'created_at',
  'has_certification',
  'certification_expiration_date',
  'certification_number',
  // FK columns (sorted by relation name)
  'type',
  'sub_type',
  'brand',
  'model',
  'linked_vehicle',
  'owner',
  'sector',
  'cost_center',
]);

/**
 * Mapeo de columnId → orderBy de Prisma para columnas FK.
 * Las columnas directas usan { field: dir } directamente,
 * pero las FK necesitan { relation: { campo: dir } }.
 */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type: { name: dir } }),
  sub_type: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
  linked_vehicle: (dir) => ({ vehicles: { domain: dir } }),
  owner: (dir) => ({ equipment_owners: { name: dir } }),
  sector: (dir) => ({ hierarchy: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
};

/** Params de URL de navegación que NO son filtros de la tabla */
const IGNORED_PARAMS = new Set(['tab', 'subtab', 'inactive_subtab']);

/** Columnas con filtro de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = [
  'serial_number',
  'intern_number',
  'manufacturer_plate',
  'invoice_number',
  'composition',
  'year',
  'horometer',
  'initial_value',
  'certification_number',
];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['purchase_date', 'created_at', 'termination_date', 'certification_expiration_date'];

/**
 * Mapping de columnId (URL) → campo real en Prisma
 * Solo para columnas cuyo ID en la URL difiere del campo en la BD
 */
const COLUMN_MAP: Record<string, string> = {
  type: 'type_id',
  sub_type: 'sub_type_id',
  brand: 'brand_id',
  model: 'model_id',
  sector: 'sector',
  owner: 'owner_id',
  cost_center: 'cost_center_id',
  linked_vehicle: 'linked_vehicle_id',
};

/** Select común con todas las relaciones resueltas */
const OTHER_EQUIPMENT_SELECT = {
  id: true,
  serial_number: true,
  intern_number: true,
  year: true,
  condition: true,
  status: true,
  horometer: true,
  manufacturer_plate: true,
  composition: true,
  invoice_number: true,
  initial_value: true,
  currency: true,
  purchase_date: true,
  cost_type: true,
  type_of_contract: true,
  reason_for_termination: true,
  termination_date: true,
  created_at: true,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  // Raw Int FK IDs — seleccionados explícitamente para usar en filterFn.
  brand_id: true,
  model_id: true,
  // FK relations
  type: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  vehicles: { select: { id: true, domain: true } },
  // M:M relation
  contractor_other_equipment: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['serial_number', 'intern_number', 'manufacturer_plate']);

  // Columnas manejadas manualmente (BigInt FK, M:M, booleano)
  const MANUALLY_HANDLED = ['brand', 'model', 'contractor_other_equipment', 'has_certification'];

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS,
      ...MANUALLY_HANDLED,
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
    ],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Int FK filters: brand_id y model_id
  const bigintFilters: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  for (const [columnId, field] of [
    ['brand', 'brand_id'],
    ['model', 'model_id'],
  ] as const) {
    const values = state.filters[columnId];
    if (!values?.length) continue;
    const hasNull = values.includes(NULL_FILTER_VALUE);
    const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
    const realIds = realValues.map(Number).filter((n) => !isNaN(n));

    if (hasNull && realIds.length > 0) {
      extraAndConditions.push({
        OR: [{ [field]: { in: realIds } }, { [field]: null }],
      });
    } else if (hasNull) {
      bigintFilters[field] = null;
    } else {
      bigintFilters[field] = { in: realIds };
    }
  }

  // M:M filter: contractor_other_equipment
  const m2mFilters: Record<string, unknown> = {};
  const contractorValues = state.filters['contractor_other_equipment'];
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { contractor_other_equipment: { some: { contractor_id: { in: realValues } } } },
          { contractor_other_equipment: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilters.contractor_other_equipment = { none: {} };
    } else {
      m2mFilters.contractor_other_equipment = {
        some: { contractor_id: { in: realValues } },
      };
    }
  }

  // Boolean filter: has_certification (NOT NULL, sin opción "Sin asignar")
  const booleanFilters: Record<string, unknown> = {};
  const hasCertificationValues = state.filters['has_certification'];
  if (hasCertificationValues?.length === 1) {
    booleanFilters.has_certification = hasCertificationValues[0] === 'true';
  }
  // Si están seleccionados ambos valores (o ninguno), no se filtra — coincide con todos

  return {
    company_id: companyId,
    is_active: true,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...bigintFilters,
    ...m2mFilters,
    ...booleanFilters,
    ...(extraAndConditions.length > 0 ? { AND: extraAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getOtherEquipmentPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos, inactivos siempre al final
    // FK columns usan FK_SORT_MAP, columnas directas usan { field: dir }
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }];

    const [rawData, total] = await Promise.all([
      prisma.other_equipment.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: OTHER_EQUIPMENT_SELECT,
      }),
      prisma.other_equipment.count({ where }),
    ]);

    return { data: rawData.map(withNumericDecimals), total };
  } catch (error) {
    logger.error('Error al obtener equipos paginados', { data: { error } });
    throw new Error('Error al obtener los equipos');
  }
}

/** `horometer` e `initial_value` son Decimal: no se pueden pasar a un Client Component. Se entregan como número. */
function withNumericDecimals<
  T extends { horometer: { toString(): string } | null; initial_value: { toString(): string } | null },
>(equipment: T) {
  return {
    ...equipment,
    horometer: equipment.horometer === null ? null : Number(equipment.horometer),
    initial_value: equipment.initial_value === null ? null : Number(equipment.initial_value),
  };
}

export type OtherEquipmentListItem = Awaited<ReturnType<typeof getOtherEquipmentPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllOtherEquipmentForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const where = buildWhereClause(companyId, state);

    const rawData = await prisma.other_equipment.findMany({
      orderBy: [{ created_at: 'desc' }],
      where,
      select: OTHER_EQUIPMENT_SELECT,
    });

    return rawData.map(withNumericDecimals);
  } catch (error) {
    logger.error('Error al exportar equipos', { data: { error } });
    throw new Error('Error al exportar los equipos');
  }
}

// ============================================================================
// FACETS
// ============================================================================

/**
 * Facets con cross-filtering: los counts de cada columna excluyen su propio filtro,
 * mostrando cuántos registros tendría cada opción si se cambiara solo ese filtro.
 */
export async function getOtherEquipmentFacets(searchParams?: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: true };

  // Parsear filtros activos (si los hay)
  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete parsedState.filters[key];
    }
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  // Helper: WHERE con todos los filtros EXCEPTO el de la columna indicada
  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified);
  }

  try {
    // Round 1: groupBy con cross-filter WHERE por columna
    const [
      conditionCounts,
      statusCounts,
      costTypeCounts,
      currencyCounts,
      reasonCounts,
      typeCounts,
      subTypeCounts,
      sectorCounts,
      ownerCounts,
      costCenterCounts,
      linkedVehicleCounts,
      brandCounts,
      modelCounts,
    ] = await Promise.all([
      prisma.other_equipment.groupBy({ by: ['condition'], where: crossWhere('condition'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['status'], where: crossWhere('status'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['cost_type'], where: crossWhere('cost_type'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['currency'], where: crossWhere('currency'), _count: true }),
      prisma.other_equipment.groupBy({
        by: ['reason_for_termination'],
        where: crossWhere('reason_for_termination'),
        _count: true,
      }),
      prisma.other_equipment.groupBy({ by: ['type_id'], where: crossWhere('type'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['sub_type_id'], where: crossWhere('sub_type'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['sector'], where: crossWhere('sector'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['owner_id'], where: crossWhere('owner'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['cost_center_id'], where: crossWhere('cost_center'), _count: true }),
      prisma.other_equipment.groupBy({
        by: ['linked_vehicle_id'],
        where: crossWhere('linked_vehicle'),
        _count: true,
      }),
      prisma.other_equipment.groupBy({ by: ['brand_id'], where: crossWhere('brand'), _count: true }),
      prisma.other_equipment.groupBy({ by: ['model_id'], where: crossWhere('model'), _count: true }),
    ]);

    // Round 2: resolver nombres de FK (solo IDs que aparecen en los counts)
    const typeIds = typeCounts.map((r) => r.type_id).filter(Boolean) as string[];
    const subTypeIds = subTypeCounts.map((r) => r.sub_type_id).filter(Boolean) as string[];
    const sectorIds = sectorCounts.map((r) => r.sector).filter(Boolean) as string[];
    const ownerIds = ownerCounts.map((r) => r.owner_id).filter(Boolean) as string[];
    const costCenterIds = costCenterCounts.map((r) => r.cost_center_id).filter(Boolean) as string[];
    const linkedVehicleIds = linkedVehicleCounts.map((r) => r.linked_vehicle_id).filter(Boolean) as string[];
    const brandIds = brandCounts.map((r) => r.brand_id).filter(Boolean) as number[];
    const modelIds = modelCounts.map((r) => r.model_id).filter(Boolean) as number[];

    const [types, subTypes, sectors, owners, costCenters, linkedVehicles, brands, models] = await Promise.all([
      typeIds.length > 0
        ? prisma.type.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })
        : [],
      subTypeIds.length > 0
        ? prisma.sub_type.findMany({ where: { id: { in: subTypeIds } }, select: { id: true, name: true } })
        : [],
      sectorIds.length > 0
        ? prisma.hierarchy.findMany({ where: { id: { in: sectorIds } }, select: { id: true, name: true } })
        : [],
      ownerIds.length > 0
        ? prisma.equipment_owners.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
        : [],
      costCenterIds.length > 0
        ? prisma.cost_center.findMany({ where: { id: { in: costCenterIds } }, select: { id: true, name: true } })
        : [],
      linkedVehicleIds.length > 0
        ? prisma.vehicles.findMany({
            where: { id: { in: linkedVehicleIds } },
            select: { id: true, domain: true },
          })
        : [],
      brandIds.length > 0
        ? prisma.brand_vehicles
            .findMany({
              where: { id: { in: brandIds } },
              select: { id: true, name: true },
            })
            .then((rows) => rows.map((r) => ({ id: String(r.id), name: r.name })))
        : ([] as { id: string; name: string | null }[]),
      modelIds.length > 0
        ? prisma.model_vehicles
            .findMany({
              where: { id: { in: modelIds } },
              select: { id: true, name: true },
            })
            .then((rows) => rows.map((r) => ({ id: String(r.id), name: r.name })))
        : ([] as { id: string; name: string | null }[]),
    ]);

    // M:M facets: contractor_other_equipment (con cross-filter)
    const contractorCrossWhere = crossWhere('contractor_other_equipment');
    const contractorRelations = await prisma.contractor_other_equipment.findMany({
      where: { other_equipment: contractorCrossWhere },
      select: { contractor_id: true },
      distinct: ['contractor_id'],
    });
    const contractorIds = contractorRelations.map((r) => r.contractor_id).filter(Boolean) as string[];
    const contractors =
      contractorIds.length > 0
        ? await prisma.customers.findMany({
            where: { id: { in: contractorIds } },
            select: { id: true, name: true },
          })
        : [];

    const contractorCountMap = new Map<string, number>();
    const allContractorRels = await prisma.contractor_other_equipment.findMany({
      where: { other_equipment: contractorCrossWhere },
      select: { contractor_id: true },
    });
    for (const rel of allContractorRels) {
      if (rel.contractor_id) {
        contractorCountMap.set(rel.contractor_id, (contractorCountMap.get(rel.contractor_id) ?? 0) + 1);
      }
    }
    // Contar equipos SIN ninguna afectación ("Sin afectar")
    const totalInCross = await prisma.other_equipment.count({ where: contractorCrossWhere });
    const withContractor = await prisma.other_equipment.count({
      where: { ...contractorCrossWhere, contractor_other_equipment: { some: {} } },
    });
    const unassignedCount = totalInCross - withContractor;
    if (unassignedCount > 0) {
      contractorCountMap.set(NULL_FILTER_VALUE, unassignedCount);
    }

    // Helper: construir Map<string, count> con soporte para null → NULL_FILTER_VALUE
    function toFacetMap(rows: { key: string | number | null | undefined; count: number }[]): Map<string, number> {
      const map = new Map<string, number>();
      for (const { key, count } of rows) {
        if (key == null) {
          map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
        } else {
          map.set(String(key), count);
        }
      }
      return map;
    }

    return {
      condition: toFacetMap(conditionCounts.map((r) => ({ key: r.condition, count: r._count }))),
      status: toFacetMap(statusCounts.map((r) => ({ key: r.status, count: r._count }))),
      cost_type: toFacetMap(costTypeCounts.map((r) => ({ key: r.cost_type, count: r._count }))),
      currency: toFacetMap(currencyCounts.map((r) => ({ key: r.currency, count: r._count }))),
      reason_for_termination: toFacetMap(reasonCounts.map((r) => ({ key: r.reason_for_termination, count: r._count }))),
      type: toFacetMap(typeCounts.map((r) => ({ key: r.type_id, count: r._count }))),
      typeOptions: types,
      sub_type: toFacetMap(subTypeCounts.map((r) => ({ key: r.sub_type_id, count: r._count }))),
      subTypeOptions: subTypes,
      sector: toFacetMap(sectorCounts.map((r) => ({ key: r.sector, count: r._count }))),
      sectorOptions: sectors,
      owner: toFacetMap(ownerCounts.map((r) => ({ key: r.owner_id, count: r._count }))),
      ownerOptions: owners,
      cost_center: toFacetMap(costCenterCounts.map((r) => ({ key: r.cost_center_id, count: r._count }))),
      costCenterOptions: costCenters,
      linked_vehicle: toFacetMap(linkedVehicleCounts.map((r) => ({ key: r.linked_vehicle_id, count: r._count }))),
      linkedVehicleOptions: linkedVehicles,
      brand: toFacetMap(brandCounts.map((r) => ({ key: r.brand_id, count: r._count }))),
      brandOptions: brands,
      model: toFacetMap(modelCounts.map((r) => ({ key: r.model_id, count: r._count }))),
      modelOptions: models,
      contractor_other_equipment: contractorCountMap,
      contractorOptions: contractors,
    };
  } catch (error) {
    logger.error('Error al obtener facets de equipos', { data: { error } });
    return null;
  }
}

export type OtherEquipmentFacets = Awaited<ReturnType<typeof getOtherEquipmentFacets>>;

// ============================================================================
// SINGLE FACET (lazy-load — UN filtro a la vez con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 * Retorna { counts, resolvedOptions? } — resolvedOptions solo para FK.
 */
export async function getOtherEquipmentSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: true };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete parsedState.filters[key];
    }
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified);
  }

  function toFacetMap(rows: { key: string | number | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  try {
    const where = crossWhere(columnId);

    // ── Enum columns (campo directo en other_equipment) ──────────────────────
    const ENUM_COLUMN_TO_FIELD: Record<string, string> = {
      condition: 'condition',
      status: 'status',
      cost_type: 'cost_type',
      currency: 'currency',
      type_of_contract: 'type_of_contract',
      reason_for_termination: 'reason_for_termination',
    };

    if (columnId in ENUM_COLUMN_TO_FIELD) {
      const field = ENUM_COLUMN_TO_FIELD[columnId]!;
      const rows = await prisma.other_equipment.groupBy({
        by: [field as 'condition'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({ key: (r as Record<string, unknown>)[field] as string | null, count: r._count }))
        ),
      };
    }

    // ── Boolean: has_certification ────────────────────────────────────────────
    if (columnId === 'has_certification') {
      const rows = await prisma.other_equipment.groupBy({ by: ['has_certification'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: String(r.has_certification), count: r._count }))),
      };
    }

    // ── FK UUID columns ──────────────────────────────────────────────────────
    const FK_UUID_CONFIG: Record<
      string,
      {
        prismaField: string;
        resolver: (ids: string[]) => Promise<Array<{ id: string; name: string | null }>>;
      }
    > = {
      type: {
        prismaField: 'type_id',
        resolver: (ids) => prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      sub_type: {
        prismaField: 'sub_type_id',
        resolver: (ids) => prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      sector: {
        prismaField: 'sector',
        resolver: (ids) => prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      owner: {
        prismaField: 'owner_id',
        resolver: (ids) =>
          prisma.equipment_owners.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      cost_center: {
        prismaField: 'cost_center_id',
        resolver: (ids) =>
          prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      linked_vehicle: {
        prismaField: 'linked_vehicle_id',
        resolver: (ids) =>
          prisma.vehicles
            .findMany({ where: { id: { in: ids } }, select: { id: true, domain: true } })
            .then((rows) => rows.map((r) => ({ id: r.id, name: r.domain }))),
      },
    };

    if (columnId in FK_UUID_CONFIG) {
      const config = FK_UUID_CONFIG[columnId]!;
      const rows = await prisma.other_equipment.groupBy({
        by: [config.prismaField as 'type_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(
        rows.map((r) => ({
          key: (r as Record<string, unknown>)[config.prismaField] as string | null,
          count: r._count,
        }))
      );
      const ids = rows.map((r) => (r as Record<string, unknown>)[config.prismaField]).filter(Boolean) as string[];
      const resolvedOptions = ids.length > 0 ? await config.resolver(ids) : [];
      return { counts, resolvedOptions };
    }

    // ── FK Int: brand_id ──────────────────────────────────────────────────
    if (columnId === 'brand') {
      const rows = await prisma.other_equipment.groupBy({ by: ['brand_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.brand_id, count: r._count })));
      const ids = rows.map((r) => r.brand_id).filter(Boolean) as number[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.brand_vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
              })
            ).map((r) => ({ id: String(r.id), name: r.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK Int: model_id ──────────────────────────────────────────────────
    if (columnId === 'model') {
      const rows = await prisma.other_equipment.groupBy({ by: ['model_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.model_id, count: r._count })));
      const ids = rows.map((r) => r.model_id).filter(Boolean) as number[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.model_vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
              })
            ).map((r) => ({ id: String(r.id), name: r.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── M:M: contractor_other_equipment ──────────────────────────────────────
    if (columnId === 'contractor_other_equipment') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.contractor_other_equipment.findMany({
          where: { other_equipment: where },
          select: { contractor_id: true },
          distinct: ['contractor_id'],
        }),
        prisma.contractor_other_equipment.findMany({
          where: { other_equipment: where },
          select: { contractor_id: true },
        }),
        prisma.other_equipment.count({ where }),
        prisma.other_equipment.count({
          where: { ...where, contractor_other_equipment: { some: {} } },
        }),
      ]);

      const counts = new Map<string, number>();
      for (const rel of allRels) {
        if (rel.contractor_id) {
          counts.set(rel.contractor_id, (counts.get(rel.contractor_id) ?? 0) + 1);
        }
      }
      const unassigned = totalInCross - withSome;
      if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);

      const contractorIds = relations.map((r) => r.contractor_id).filter(Boolean) as string[];
      const resolvedOptions =
        contractorIds.length > 0
          ? await prisma.customers.findMany({
              where: { id: { in: contractorIds } },
              select: { id: true, name: true },
            })
          : [];

      return { counts, resolvedOptions };
    }

    logger.warn('getOtherEquipmentSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de otros equipos', { data: { error, columnId } });
    return null;
  }
}
