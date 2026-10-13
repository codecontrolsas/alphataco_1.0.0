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

const logger = new Logger('Equipos/DadosDeBaja/OtrosEquipos/actions.server');

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
  'reason_for_termination',
  'termination_date',
  'created_at',
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
];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['purchase_date', 'created_at', 'termination_date'];

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

/**
 * Select común con todas las relaciones resueltas.
 * brand_id y model_id son Int (number), se pueden serializar directamente en RSC.
 */
const INACTIVE_OTHER_EQUIPMENT_SELECT = {
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
  reason_for_termination: true,
  termination_date: true,
  created_at: true,
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

  // Columnas manejadas manualmente (BigInt FK, M:M)
  const MANUALLY_HANDLED = ['brand', 'model', 'contractor_other_equipment'];

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

  return {
    company_id: companyId,
    is_active: false, // Solo equipos inactivos (dados de baja)
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...bigintFilters,
    ...m2mFilters,
    ...(extraAndConditions.length > 0 ? { AND: extraAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getInactiveOtherEquipmentPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    const safeOrderBy = [...resolvedSorts, { termination_date: 'desc' as const }, { created_at: 'desc' as const }];

    const [rawData, total] = await Promise.all([
      prisma.other_equipment.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: INACTIVE_OTHER_EQUIPMENT_SELECT,
      }),
      prisma.other_equipment.count({ where }),
    ]);

    return { data: rawData.map(withNumericDecimals), total };
  } catch (error) {
    logger.error('Error al obtener equipos dados de baja paginados', { data: { error } });
    throw new Error('Error al obtener los equipos dados de baja');
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

export type InactiveOtherEquipmentListItem = Awaited<
  ReturnType<typeof getInactiveOtherEquipmentPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllInactiveOtherEquipmentForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const where = buildWhereClause(companyId, state);

    const rawData = await prisma.other_equipment.findMany({
      orderBy: [{ termination_date: 'desc' }, { created_at: 'desc' }],
      where,
      select: INACTIVE_OTHER_EQUIPMENT_SELECT,
    });

    return rawData.map(withNumericDecimals);
  } catch (error) {
    logger.error('Error al exportar equipos dados de baja', { data: { error } });
    throw new Error('Error al exportar los equipos dados de baja');
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Retorna facets para UNA sola columna con cross-filtering.
 * Solo incluye registros inactivos (is_active = false).
 * Esta función se invoca desde el cliente cuando el usuario abre el popover de un filtro.
 */
export async function getInactiveOtherEquipmentSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: { value: string; label: string }[];
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: false as const };

  // Parsear filtros activos (si los hay)
  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete parsedState.filters[key];
    }
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  // WHERE con todos los filtros EXCEPTO el de la columna solicitada (cross-filter)
  function crossWhere() {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[columnId];
    delete modified.filters[`${columnId}_from`];
    delete modified.filters[`${columnId}_to`];
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
    const where = crossWhere();

    switch (columnId) {
      // ── Enum columns ────────────────────────────────────────────────────────
      case 'condition': {
        const rows = await prisma.other_equipment.groupBy({ by: ['condition'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.condition, count: r._count }))) };
      }
      case 'status': {
        const rows = await prisma.other_equipment.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
      }
      case 'cost_type': {
        const rows = await prisma.other_equipment.groupBy({ by: ['cost_type'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.cost_type, count: r._count }))) };
      }
      case 'currency': {
        const rows = await prisma.other_equipment.groupBy({ by: ['currency'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.currency, count: r._count }))) };
      }
      case 'reason_for_termination': {
        const rows = await prisma.other_equipment.groupBy({ by: ['reason_for_termination'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.reason_for_termination, count: r._count }))) };
      }

      // ── FK UUID columns ─────────────────────────────────────────────────────
      case 'type': {
        const rows = await prisma.other_equipment.groupBy({ by: ['type_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.type_id, count: r._count })));
        const ids = rows.map((r) => r.type_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sub_type': {
        const rows = await prisma.other_equipment.groupBy({ by: ['sub_type_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.sub_type_id, count: r._count })));
        const ids = rows.map((r) => r.sub_type_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'owner': {
        const rows = await prisma.other_equipment.groupBy({ by: ['owner_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.owner_id, count: r._count })));
        const ids = rows.map((r) => r.owner_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.equipment_owners.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sector': {
        const rows = await prisma.other_equipment.groupBy({ by: ['sector'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.sector, count: r._count })));
        const ids = rows.map((r) => r.sector).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'cost_center': {
        const rows = await prisma.other_equipment.groupBy({ by: ['cost_center_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.cost_center_id, count: r._count })));
        const ids = rows.map((r) => r.cost_center_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'linked_vehicle': {
        const rows = await prisma.other_equipment.groupBy({ by: ['linked_vehicle_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.linked_vehicle_id, count: r._count })));
        const ids = rows.map((r) => r.linked_vehicle_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, domain: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.domain ?? o.id })) };
      }

      // ── FK Int columns ───────────────────────────────────────────────────────
      case 'brand': {
        const rows = await prisma.other_equipment.groupBy({ by: ['brand_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.brand_id, count: r._count })));
        const ids = rows.map((r) => r.brand_id).filter(Boolean) as number[];
        const options =
          ids.length > 0
            ? await prisma.brand_vehicles
                .findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
                .then((rows) => rows.map((r) => ({ value: String(r.id), label: r.name ?? '' })))
            : [];
        return { counts, resolvedOptions: options };
      }
      case 'model': {
        const rows = await prisma.other_equipment.groupBy({ by: ['model_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.model_id, count: r._count })));
        const ids = rows.map((r) => r.model_id).filter(Boolean) as number[];
        const options =
          ids.length > 0
            ? await prisma.model_vehicles
                .findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
                .then((rows) => rows.map((r) => ({ value: String(r.id), label: r.name ?? '' })))
            : [];
        return { counts, resolvedOptions: options };
      }

      // ── M:M column ──────────────────────────────────────────────────────────
      case 'contractor_other_equipment': {
        const countMap = new Map<string, number>();

        const allRels = await prisma.contractor_other_equipment.findMany({
          where: { other_equipment: where },
          select: { contractor_id: true },
        });
        for (const rel of allRels) {
          if (rel.contractor_id) {
            countMap.set(rel.contractor_id, (countMap.get(rel.contractor_id) ?? 0) + 1);
          }
        }

        const totalInCross = await prisma.other_equipment.count({ where });
        const withContractor = await prisma.other_equipment.count({
          where: { ...where, contractor_other_equipment: { some: {} } },
        });
        const unassignedCount = totalInCross - withContractor;
        if (unassignedCount > 0) {
          countMap.set(NULL_FILTER_VALUE, unassignedCount);
        }

        const contractorIds = [...countMap.keys()].filter((k) => k !== NULL_FILTER_VALUE);
        const contractors =
          contractorIds.length > 0
            ? await prisma.customers.findMany({
                where: { id: { in: contractorIds } },
                select: { id: true, name: true },
              })
            : [];

        return {
          counts: countMap,
          resolvedOptions: contractors.map((c) => ({ value: c.id, label: c.name ?? '' })),
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet de equipo dado de baja', { data: { error, columnId } });
    return null;
  }
}
