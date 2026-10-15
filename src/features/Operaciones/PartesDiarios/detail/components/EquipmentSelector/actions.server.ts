'use server';

import { toFacetMap as toSharedFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('Operaciones/PartesDiarios/EquipmentSelector');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla vehicles que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'domain',
  'intern_number',
  'chassis',
  'engine',
  'serie',
  'year',
  'status',
  'condition',
  'kilometer',
  // FK columns sorted via FK_SORT_MAP
  'type',
  'sub_type',
  'brand',
  'model',
  'type_of_vehicle',
]);

/** Mapping de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  sub_type: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
  type_of_vehicle: (dir) => ({ types_of_vehicles: { name: dir } }),
};

/** Columnas de texto libre */
const TEXT_FILTER_COLUMNS = ['domain', 'intern_number', 'chassis', 'engine', 'serie', 'year', 'kilometer'];

/** Mapping de columnId (URL) → campo real en Prisma */
const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  condition: 'condition',
};

/** Columnas manejadas manualmente (BigInt FK, UUID FK, M:M) */
const MANUALLY_HANDLED = ['type', 'sub_type', 'brand', 'model', 'type_of_vehicle', 'contractor_equipment'];

// ============================================================================
// SELECT COMMON
// ============================================================================

const EQUIPMENT_SELECTOR_SELECT = {
  id: true,
  domain: true,
  intern_number: true,
  chassis: true,
  engine: true,
  serie: true,
  year: true,
  status: true,
  condition: true,
  kilometer: true,
  picture: true,
  // FK relations
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { id: true, name: true } },
  model_vehicles: { select: { id: true, name: true } },
  types_of_vehicles: { select: { id: true, name: true } },
  // M:M relations
  contractor_equipment: {
    select: {
      contractor_id: true,
      customers: { select: { id: true, name: true } },
    },
  },
} as const;

// ============================================================================
// WHERE CLAUSE HELPER (shared between paginated and facets)
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['domain', 'intern_number']);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, ...MANUALLY_HANDLED],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  // M:M: contractor_equipment
  const m2mFilters: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  const contractorValues = state.filters['contractor_equipment'];
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { contractor_equipment: { some: { contractor_id: { in: realValues } } } },
          { contractor_equipment: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilters['contractor_equipment'] = { none: {} };
    } else {
      m2mFilters['contractor_equipment'] = { some: { contractor_id: { in: realValues } } };
    }
  }

  // FK UUID: type (vehicle type — model `type`)
  const typeValues = state.filters['type'];
  if (typeValues?.length) {
    const hasNull = typeValues.includes(NULL_FILTER_VALUE);
    const realValues = typeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [{ type: { in: realValues } }, { type: null }],
      });
    } else if (!hasNull) {
      m2mFilters['type'] = { in: realValues };
    }
  }

  // FK UUID: sub_type
  const subTypeValues = state.filters['sub_type'];
  if (subTypeValues?.length) {
    const hasNull = subTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = subTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [{ subType: { in: realValues } }, { subType: null }],
      });
    } else if (hasNull) {
      m2mFilters['subType'] = null;
    } else {
      m2mFilters['subType'] = { in: realValues };
    }
  }

  // FK Int: brand
  const brandValues = state.filters['brand'];
  if (brandValues?.length) {
    const ids = brandValues.map(Number).filter((n) => !isNaN(n));
    if (ids.length > 0) {
      m2mFilters['brand'] = ids.length === 1 ? ids[0] : { in: ids };
    }
  }

  // FK Int: model
  const modelValues = state.filters['model'];
  if (modelValues?.length) {
    const ids = modelValues.map(Number).filter((n) => !isNaN(n));
    if (ids.length > 0) {
      m2mFilters['model'] = ids.length === 1 ? ids[0] : { in: ids };
    }
  }

  // FK BigInt: type_of_vehicle
  const tovValues = state.filters['type_of_vehicle'];
  if (tovValues?.length) {
    const ids = tovValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .map((v) => BigInt(v))
      .filter(Boolean);
    if (ids.length > 0) {
      m2mFilters['type_of_vehicle'] = ids.length === 1 ? ids[0] : { in: ids };
    }
  }

  // Consolidate AND conditions
  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const allAndConditions = [...filtersWhereAndConditions, ...extraAndConditions];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & {
    AND?: unknown;
  };

  return {
    company_id: companyId,
    is_active: true,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...m2mFilters,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getActiveEquipmentPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe multi-sort
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { domain: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.vehicles.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: EQUIPMENT_SELECTOR_SELECT,
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener equipos activos paginados', { data: { error } });
    throw new Error('Error al obtener equipos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

export async function getEquipmentSelectorSingleFacet(
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
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    return buildWhereClause(companyId, withoutOwnFilter(parsedState, excludeColumn));
  }

  /** Las FK bigint/int llegan numéricas: se pasan a string para el mapa compartido. */
  function toFacetMap(
    rows: { key: string | bigint | number | null | undefined; count: number }[]
  ): Map<string, number> {
    return toSharedFacetMap(rows.map(({ key, count }) => ({ key: key == null ? null : String(key), count })));
  }

  try {
    const where = crossWhere(columnId);

    // ── Enum columns ──────────────────────────────────────────────────────────
    const ENUM_COLUMNS: Record<string, string> = {
      status: 'status',
      condition: 'condition',
    };

    if (columnId in ENUM_COLUMNS) {
      const field = ENUM_COLUMNS[columnId]!;
      const rows = await prisma.vehicles.groupBy({
        by: [field as 'status'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({
            key: (r as Record<string, unknown>)[field] as string | null,
            count: r._count,
          }))
        ),
      };
    }

    // ── FK UUID: type (vehicle type) ──────────────────────────────────────────
    if (columnId === 'type') {
      const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.type, count: r._count })));
      const ids = rows.map((r) => r.type).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? await prisma.type.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK UUID: sub_type ─────────────────────────────────────────────────────
    if (columnId === 'sub_type') {
      const rows = await prisma.vehicles.groupBy({ by: ['subType'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.subType, count: r._count })));
      const ids = rows.map((r) => r.subType).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? await prisma.sub_type.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK Int: brand ─────────────────────────────────────────────────────────
    if (columnId === 'brand') {
      const rows = await prisma.vehicles.groupBy({ by: ['brand'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.brand, count: r._count })));
      const ids = rows.map((r) => r.brand).filter(Boolean) as number[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.brand_vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            ).map((b) => ({ id: String(b.id), name: b.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK Int: model ─────────────────────────────────────────────────────────
    if (columnId === 'model') {
      const rows = await prisma.vehicles.groupBy({ by: ['model'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.model, count: r._count })));
      const ids = rows.map((r) => r.model).filter(Boolean) as number[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.model_vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            ).map((m) => ({ id: String(m.id), name: m.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK BigInt: type_of_vehicle ────────────────────────────────────────────
    if (columnId === 'type_of_vehicle') {
      const rows = await prisma.vehicles.groupBy({ by: ['type_of_vehicle'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.type_of_vehicle, count: r._count })));
      const ids = rows.map((r) => r.type_of_vehicle).filter(Boolean) as bigint[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.types_of_vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            ).map((t) => ({ id: String(t.id), name: t.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── M:M: contractor_equipment ─────────────────────────────────────────────
    if (columnId === 'contractor_equipment') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.contractor_equipment.findMany({
          where: { vehicles: where },
          select: {
            contractor_id: true,
            customers: { select: { id: true, name: true } },
          },
          distinct: ['contractor_id'],
        }),
        prisma.contractor_equipment.findMany({
          where: { vehicles: where },
          select: { contractor_id: true },
        }),
        prisma.vehicles.count({ where }),
        prisma.vehicles.count({
          where: { ...where, contractor_equipment: { some: {} } },
        }),
      ]);

      const countMap = new Map<string, number>();
      for (const rel of allRels) {
        if (rel.contractor_id) {
          countMap.set(rel.contractor_id, (countMap.get(rel.contractor_id) ?? 0) + 1);
        }
      }
      const unassigned = totalInCross - withSome;
      if (unassigned > 0) countMap.set(NULL_FILTER_VALUE, unassigned);

      const resolvedOptions = relations
        .filter((r) => r.contractor_id && r.customers)
        .map((r) => ({ id: r.customers!.id, name: r.customers!.name }));

      return { counts: countMap, resolvedOptions };
    }

    logger.warn('Facet column not recognized in equipment selector', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual del selector de equipos', {
      data: { error, columnId },
    });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type EquipmentSelectorItem = Awaited<ReturnType<typeof getActiveEquipmentPaginated>>['data'][number];
