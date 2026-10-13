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
import { VEHICLE_SELECT } from '@/shared/prisma-selects/vehicle-select';

const logger = new Logger('Vehicles/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de vehicles que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'domain',
  'chassis',
  'engine',
  'serie',
  'intern_number',
  'year',
  'condition',
  'status',
  'kilometer',
  'engine_hours',
  'type_of_contract',
  'contract_expiration_date',
  'contract_start_date',
  'contract_number',
  'currency',
  'price',
  'cost_type',
  'termination_date',
  'reason_for_termination',
  'created_at',
  'has_certification',
  'certification_expiration_date',
  'certification_number',
  // FK columns (sorted by relation name)
  'type',
  'sub_type',
  'brand',
  'model',
  'owner',
  'sector',
  'cost_center',
  'type_of_vehicle',
  // Checklist (ticket 685) — cantidad ordenable via aggregate _count.
  // La fecha del ultimo checklist NO se agrega aqui: Prisma no soporta ordenar
  // por MAX() de un campo de una relacion 1:N sin SQL crudo. Dado el costo/riesgo
  // de mantener una query raw en paralelo al resto de filtros, se deja esa columna
  // sin ordenamiento (ver `enableSorting: false` en columns.tsx).
  'checklist_count',
]);

/**
 * Mapeo de columnId → orderBy de Prisma para columnas FK.
 * Las columnas FK necesitan { relation: { campo: dir } }.
 */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  sub_type: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
  owner: (dir) => ({ equipment_owners: { name: dir } }),
  sector: (dir) => ({ hierarchy: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
  type_of_vehicle: (dir) => ({ types_of_vehicles: { name: dir } }),
  checklist_count: (dir) => ({ checklist_answers: { _count: dir } }),
};

/** Params de URL de navegación que NO son filtros de la tabla */
const IGNORED_PARAMS = new Set(['tab', 'subtab', 'inactive_subtab']);

/** Columnas con filtro de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = [
  'domain',
  'chassis',
  'engine',
  'serie',
  'intern_number',
  'contract_number',
  'year',
  'kilometer',
  'engine_hours',
  'price',
  'certification_number',
];

/**
 * Columnas virtuales derivadas de la relacion checklist_answers.
 * NO son campos reales de vehicles — se manejan manualmente en buildWhereClause
 * (no pasan por buildTextFiltersWhere / buildDateRangeFiltersWhere genericos).
 */
const CHECKLIST_VIRTUAL_COLUMNS = ['checklist_count', 'last_checklist_date'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = [
  'contract_expiration_date',
  'contract_start_date',
  'termination_date',
  'created_at',
  'certification_expiration_date',
];

/**
 * Mapping de columnId (URL) → campo real en Prisma
 * Solo para columnas cuyo ID en la URL difiere del campo en la BD
 */
const COLUMN_MAP: Record<string, string> = {
  type: 'type',
  sub_type: 'subType',
  owner: 'owner_id',
  sector: 'sector',
  cost_center: 'cost_center_id',
};

/**
 * Select de la tabla de vehiculos, extendido con los datos de checklist (ticket 685):
 * cantidad de checklist realizados y fecha del ultimo. Se extiende localmente en vez
 * de modificar VEHICLE_SELECT porque ese select es compartido con la API externa y
 * con Mantenimiento — agregar estos campos ahi impactaria consumidores que no
 * corresponde tocar en este ticket.
 */
const VEHICLE_LIST_SELECT = {
  ...VEHICLE_SELECT,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  _count: { select: { checklist_answers: true } },
  checklist_answers: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
    select: { created_at: true },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Filtro de "cantidad de checklist" (columna virtual, no es un campo real de vehicles).
 * - 0 → vehiculos sin ningun checklist (`checklist_answers: none`)
 * - N > 0 → vehiculos con exactamente N checklist, resuelto con groupBy + having
 *   (agregacion en una sola query, sin traer checklists a memoria).
 */
async function buildChecklistCountFilter(
  companyId: string,
  values: string[] | undefined
): Promise<Record<string, unknown> | null> {
  const raw = values?.[0]?.trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;

  if (n === 0) {
    return { checklist_answers: { none: {} } };
  }

  const groups = await prisma.checklist_answers.groupBy({
    by: ['equipment_id'],
    where: { vehicles: { company_id: companyId, is_active: true, type_of_vehicle: 1 } },
    _count: { equipment_id: true },
    having: { equipment_id: { _count: { equals: n } } },
  });

  return { id: { in: groups.map((g) => g.equipment_id) } };
}

/**
 * Filtro de rango de fechas sobre el ultimo checklist (columna virtual).
 * Reutiliza buildDateRangeFiltersWhere para parsear los params _from/_to, pero el
 * resultado se aplica como EXISTS sobre la relacion (no es un campo escalar de vehicles).
 */
function buildLastChecklistDateFilter(state: ReturnType<typeof parseSearchParams>): Record<string, unknown> | null {
  const range = buildDateRangeFiltersWhere(state.filters, ['last_checklist_date']) as {
    last_checklist_date?: { gte?: Date; lte?: Date };
  };
  if (!range.last_checklist_date) return null;
  return { checklist_answers: { some: { created_at: range.last_checklist_date } } };
}

async function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['domain', 'chassis', 'intern_number', 'engine']);

  // Columnas manejadas manualmente (BigInt FK, M:M, virtuales de checklist, booleano)
  const MANUALLY_HANDLED = [
    'brand',
    'model',
    'contractor_equipment',
    'has_certification',
    ...CHECKLIST_VIRTUAL_COLUMNS,
  ];

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS,
      ...MANUALLY_HANDLED,
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      ...CHECKLIST_VIRTUAL_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
    ],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const checklistCountFilter = await buildChecklistCountFilter(companyId, state.filters['checklist_count']);
  const lastChecklistDateFilter = buildLastChecklistDateFilter(state);

  // Int FK filters: brand y model
  const bigintFilters: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  for (const [columnId, field] of [
    ['brand', 'brand'],
    ['model', 'model'],
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

  // M:M filter: contractor_equipment
  const m2mFilters: Record<string, unknown> = {};
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
      m2mFilters.contractor_equipment = { none: {} };
    } else {
      m2mFilters.contractor_equipment = {
        some: { contractor_id: { in: realValues } },
      };
    }
  }

  if (checklistCountFilter) extraAndConditions.push(checklistCountFilter);
  if (lastChecklistDateFilter) extraAndConditions.push(lastChecklistDateFilter);

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
    type_of_vehicle: 1, // Solo vehículos (type_of_vehicle = 1)
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

export async function getVehiclesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const { skip, take } = stateToPrismaParams(state);

    const where = await buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos, default por domain
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    const safeOrderBy = [...resolvedSorts, { domain: 'asc' as const }];

    const [rawData, total] = await Promise.all([
      prisma.vehicles.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: VEHICLE_LIST_SELECT,
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data: rawData.map(withNumericPrice), total };
  } catch (error) {
    logger.error('Error al obtener vehículos paginados', { data: { error } });
    throw new Error(`Error al obtener los vehículos: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `price` es Decimal: no se puede pasar a un Client Component. Se entrega como número. */
function withNumericPrice<T extends { price: { toString(): string } | null }>(vehicle: T) {
  return { ...vehicle, price: vehicle.price === null ? null : Number(vehicle.price) };
}

export type VehicleListItem = Awaited<ReturnType<typeof getVehiclesPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllVehiclesForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const where = await buildWhereClause(companyId, state);

    const rawData = await prisma.vehicles.findMany({
      orderBy: [{ domain: 'asc' }],
      where,
      select: VEHICLE_LIST_SELECT,
    });

    return rawData.map(withNumericPrice);
  } catch (error) {
    logger.error('Error al exportar vehículos', { data: { error } });
    throw new Error('Error al exportar los vehículos');
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Retorna facets para UNA sola columna con cross-filtering.
 * Solo incluye vehículos activos (is_active = true, type_of_vehicle = 1).
 * Esta función se invoca desde el cliente cuando el usuario abre el popover de un filtro.
 */
export async function getVehicleSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: { value: string; label: string }[];
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: true as const, type_of_vehicle: 1 };

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
  async function crossWhere() {
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
    const where = await crossWhere();

    switch (columnId) {
      // ── Enum columns ────────────────────────────────────────────────────────
      case 'condition': {
        const rows = await prisma.vehicles.groupBy({ by: ['condition'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.condition, count: r._count }))) };
      }
      case 'status': {
        const rows = await prisma.vehicles.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
      }
      case 'type_of_contract': {
        const rows = await prisma.vehicles.groupBy({ by: ['type_of_contract'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.type_of_contract, count: r._count }))) };
      }
      case 'cost_type': {
        const rows = await prisma.vehicles.groupBy({ by: ['cost_type'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.cost_type, count: r._count }))) };
      }
      case 'currency': {
        const rows = await prisma.vehicles.groupBy({ by: ['currency'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.currency, count: r._count }))) };
      }
      case 'reason_for_termination': {
        const rows = await prisma.vehicles.groupBy({ by: ['reason_for_termination'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.reason_for_termination, count: r._count }))) };
      }

      // ── Boolean columns ─────────────────────────────────────────────────────
      case 'has_certification': {
        const rows = await prisma.vehicles.groupBy({ by: ['has_certification'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: String(r.has_certification), count: r._count }))) };
      }

      // ── FK UUID columns ─────────────────────────────────────────────────────
      case 'type': {
        const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.type, count: r._count })));
        const ids = rows.map((r) => r.type).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sub_type': {
        const rows = await prisma.vehicles.groupBy({ by: ['subType'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.subType, count: r._count })));
        const ids = rows.map((r) => r.subType).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'owner': {
        const rows = await prisma.vehicles.groupBy({ by: ['owner_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.owner_id, count: r._count })));
        const ids = rows.map((r) => r.owner_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.equipment_owners.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sector': {
        const rows = await prisma.vehicles.groupBy({ by: ['sector'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.sector, count: r._count })));
        const ids = rows.map((r) => r.sector).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'cost_center': {
        const rows = await prisma.vehicles.groupBy({ by: ['cost_center_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.cost_center_id, count: r._count })));
        const ids = rows.map((r) => r.cost_center_id).filter(Boolean) as string[];
        const options =
          ids.length > 0
            ? await prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }

      // ── FK Int columns ───────────────────────────────────────────────────────
      case 'brand': {
        const rows = await prisma.vehicles.groupBy({ by: ['brand'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.brand, count: r._count })));
        const ids = rows.map((r) => r.brand).filter(Boolean) as number[];
        const options =
          ids.length > 0
            ? await prisma.brand_vehicles
                .findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
                .then((rows) => rows.map((r) => ({ value: String(r.id), label: r.name ?? '' })))
            : [];
        return { counts, resolvedOptions: options };
      }
      case 'model': {
        const rows = await prisma.vehicles.groupBy({ by: ['model'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.model, count: r._count })));
        const ids = rows.map((r) => r.model).filter(Boolean) as number[];
        const options =
          ids.length > 0
            ? await prisma.model_vehicles
                .findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
                .then((rows) => rows.map((r) => ({ value: String(r.id), label: r.name ?? '' })))
            : [];
        return { counts, resolvedOptions: options };
      }

      // ── M:M column ──────────────────────────────────────────────────────────
      case 'contractor_equipment': {
        const countMap = new Map<string, number>();

        const allRels = await prisma.contractor_equipment.findMany({
          where: { vehicles: where },
          select: { contractor_id: true },
        });
        for (const rel of allRels) {
          if (rel.contractor_id) {
            countMap.set(rel.contractor_id, (countMap.get(rel.contractor_id) ?? 0) + 1);
          }
        }

        const totalInCross = await prisma.vehicles.count({ where });
        const withContractor = await prisma.vehicles.count({
          where: { ...where, contractor_equipment: { some: {} } },
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
    logger.error('Error al obtener facet de vehículo', { data: { error, columnId } });
    return null;
  }
}
