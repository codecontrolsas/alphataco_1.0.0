'use server';

import {
  buildDeliveryStockWhere,
  DELIVERY_STATUS_ACTIVE,
  DELIVERY_STATUS_CANCELLED,
  DELIVERY_STOCK_MANUAL_COLUMNS,
  DELIVERY_STOCK_SELECT,
  serializeDeliveryCost,
} from '@/features/Clothing/lib/delivery-stock-where';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
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

const logger = new Logger('Clothing/EmployeeDeliveries/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla clothing_deliveries que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['delivered_at', 'delivery_type', 'created_at', 'notes']);

/** Columnas que son filtros de texto libre */
const TEXT_FILTER_COLUMNS = ['notes'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['delivered_at'];

/** Columnas manejadas manualmente (excluir de buildFiltersWhere) */
const MANUALLY_HANDLED_COLUMNS = [
  ...TEXT_FILTER_COLUMNS,
  ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
  'delivered_by_id',
  'delivered_by_file',
  ...DELIVERY_STOCK_MANUAL_COLUMNS,
];

/** Mapeo de columnas FK para ordenamiento server-side */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  delivered_by_id: (dir) => ({
    employees_clothing_deliveries_delivered_by_idToemployees: { lastname: dir },
  }),
  status: (dir) => ({ cancelled_at: dir }),
  warehouse: (dir) => ({ warehouse: { name: dir } }),
};

/** El costo del movimiento de stock solo sale del servidor con `almacenes:movimientos:view_prices`. */
async function canViewDeliveryPrices() {
  return checkPermissionServer('almacenes', 'movimientos', 'view_prices');
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Construye el SELECT de include compartido entre paginated, export y facets.
 */
const DELIVERY_SELECT = {
  id: true,
  delivery_type: true,
  delivered_at: true,
  notes: true,
  signature_url: true,
  ...DELIVERY_STOCK_SELECT,
  employees_clothing_deliveries_employee_idToemployees: {
    select: { id: true, firstname: true, lastname: true, file: true },
  },
  employees_clothing_deliveries_delivered_by_idToemployees: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      file: true,
    },
  },
  clothing_delivery_items: {
    select: {
      id: true,
      quantity: true,
      clothing_items: {
        select: { id: true, name: true },
      },
      clothing_brands: {
        select: { id: true, name: true },
      },
      clothing_sizes: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(
  companyId: string,
  employeeId: string,
  state: ReturnType<typeof parseSearchParams>,
  canViewPrices: boolean
) {
  const searchWhere = buildSearchWhere(state.search, ['notes']);

  const filtersWhere = buildFiltersWhere(state.filters, {}, { exclude: MANUALLY_HANDLED_COLUMNS });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // FK filter for delivered_by_id
  let deliveredByWhere: Record<string, unknown> = {};
  const deliveredByFilter = state.filters['delivered_by_id'];
  if (deliveredByFilter && Array.isArray(deliveredByFilter) && deliveredByFilter.length > 0) {
    const values = deliveredByFilter as string[];
    if (values.includes(NULL_FILTER_VALUE)) {
      const nonNullValues = values.filter((v) => v !== NULL_FILTER_VALUE);
      deliveredByWhere = {
        OR: [
          { delivered_by_id: null },
          ...(nonNullValues.length > 0 ? [{ delivered_by_id: { in: nonNullValues } }] : []),
        ],
      };
    } else {
      deliveredByWhere = { delivered_by_id: { in: values } };
    }
  }

  // Text filter: delivered_by_file (legajo del que entrega)
  const deliveredByFileValues = state.filters['delivered_by_file'];
  const deliveredByFileSearch = deliveredByFileValues?.[0]?.trim();
  let deliveredByFileWhere: Record<string, unknown> = {};
  if (deliveredByFileSearch) {
    deliveredByFileWhere = {
      employees_clothing_deliveries_delivered_by_idToemployees: {
        file: { contains: deliveredByFileSearch, mode: 'insensitive' },
      },
    };
  }

  return {
    company_id: companyId,
    employee_id: employeeId,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...deliveredByWhere,
    ...deliveredByFileWhere,
    ...buildDeliveryStockWhere(state.filters, canViewPrices),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getEmployeeDeliveriesPaginated(employeeId: string, searchParams: DataTableSearchParams) {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, employeeId, state, canViewPrices);

    // Safe orderBy: multi-sort, solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (s.id === 'cost') {
        // Ordenar por costo sin permiso permitiria deducir los importes.
        if (canViewPrices) resolvedSorts.push({ stock_movement: { total_cost: dir } });
      } else if (fkMapper) {
        resolvedSorts.push(fkMapper(dir));
      } else if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { delivered_at: 'desc' as const }];

    const [data, total] = await Promise.all([
      prisma.clothing_deliveries.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: DELIVERY_SELECT,
      }),
      prisma.clothing_deliveries.count({ where }),
    ]);

    return { data: data.map((row) => serializeDeliveryCost(row, canViewPrices)), total };
  } catch (error) {
    logger.error('Error al obtener entregas de empleado paginadas', { data: { error, employeeId } });
    throw new Error(`Error al obtener las entregas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllEmployeeDeliveriesForExport(employeeId: string, searchParams: DataTableSearchParams) {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, employeeId, state, canViewPrices);

    const data = await prisma.clothing_deliveries.findMany({
      orderBy: [{ delivered_at: 'desc' }],
      where,
      select: DELIVERY_SELECT,
    });

    return data.map((row) => serializeDeliveryCost(row, canViewPrices));
  } catch (error) {
    logger.error('Error al exportar entregas de empleado', { data: { error, employeeId } });
    throw new Error('Error al exportar las entregas');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getEmployeeDeliveriesSingleFacet(
  columnId: string,
  employeeId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) {
      return { company_id: companyId, employee_id: employeeId };
    }
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, employeeId, modified, canViewPrices);
  }

  function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
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

    // ── Enum: delivery_type ──
    if (columnId === 'delivery_type') {
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['delivery_type'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.delivery_type, count: r._count }))),
      };
    }

    // ── Estado (virtual: cancelled_at) ──
    if (columnId === 'status') {
      const [active, cancelled] = await Promise.all([
        prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: null } }),
        prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: { not: null } } }),
      ]);
      const counts = new Map<string, number>();
      if (active > 0) counts.set(DELIVERY_STATUS_ACTIVE, active);
      if (cancelled > 0) counts.set(DELIVERY_STATUS_CANCELLED, cancelled);
      return { counts };
    }

    // ── FK nullable: warehouse ──
    if (columnId === 'warehouse') {
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['warehouse_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.warehouse_id, count: r._count })));
      const ids = rows.map((r) => r.warehouse_id).filter((id): id is string => id != null);
      const warehouses =
        ids.length > 0
          ? await prisma.warehouses.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
          : [];
      return { counts, resolvedOptions: warehouses };
    }

    // ── FK: delivered_by_id ──
    if (columnId === 'delivered_by_id') {
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['delivered_by_id'],
        where,
        _count: true,
      });

      const counts = toFacetMap(rows.map((r) => ({ key: r.delivered_by_id, count: r._count })));

      // Resolve employee names for labels
      const nonNullIds = rows.map((r) => r.delivered_by_id).filter((id): id is string => id != null);

      let resolvedOptions: Array<{ id: string; name: string | null }> = [];
      if (nonNullIds.length > 0) {
        const employees = await prisma.employees.findMany({
          where: { id: { in: nonNullIds } },
          select: { id: true, firstname: true, lastname: true, file: true },
        });
        resolvedOptions = employees.map((e) => ({
          id: e.id,
          name: `[${e.file ?? ''}] ${e.lastname ?? ''} ${e.firstname ?? ''}`.trim(),
        }));
      }

      return { counts, resolvedOptions };
    }

    logger.warn('Facet column not recognized for employee deliveries', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de entregas', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type EmployeeDeliveryListItem = Awaited<ReturnType<typeof getEmployeeDeliveriesPaginated>>['data'][number];
