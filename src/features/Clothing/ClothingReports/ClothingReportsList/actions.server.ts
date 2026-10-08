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

const logger = new Logger('Clothing/ClothingReports/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de clothing_deliveries que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['delivery_type', 'delivered_at', 'created_at', 'signature_url', 'notes']);

/** FK sort map: columnId → Prisma orderBy */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  employee: (dir) => ({
    employees_clothing_deliveries_employee_idToemployees: { lastname: dir },
  }),
  delivered_by: (dir) => ({
    employees_clothing_deliveries_delivered_by_idToemployees: { lastname: dir },
  }),
  status: (dir) => ({ cancelled_at: dir }),
  warehouse: (dir) => ({ warehouse: { name: dir } }),
};

/** El costo del movimiento de stock solo sale del servidor con `almacenes:movimientos:view_prices`. */
async function canViewDeliveryPrices() {
  return checkPermissionServer('almacenes', 'movimientos', 'view_prices');
}

/** Columnas filtradas como texto libre */
const TEXT_FILTER_COLUMNS = ['notes'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['delivered_at', 'created_at'];

/** Columnas manejadas manualmente (excluir de buildFiltersWhere) */
const MANUALLY_HANDLED_COLUMNS = [
  ...TEXT_FILTER_COLUMNS,
  ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
  'employee',
  'delivered_by',
  'has_signature',
  'employee_file',
  'delivered_by_file',
  ...DELIVERY_STOCK_MANUAL_COLUMNS,
];

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>, canViewPrices: boolean) {
  const searchWhere = buildSearchWhere(state.search, ['notes']);

  const filtersWhere = buildFiltersWhere(state.filters, {}, { exclude: MANUALLY_HANDLED_COLUMNS });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // FK employee filter
  const employeeFilter = state.filters['employee'];
  const employeeWhere =
    Array.isArray(employeeFilter) && employeeFilter.length > 0 ? { employee_id: { in: employeeFilter } } : {};

  // FK delivered_by filter
  const deliveredByFilter = state.filters['delivered_by'];
  const deliveredByWhere =
    Array.isArray(deliveredByFilter) && deliveredByFilter.length > 0
      ? { delivered_by_id: { in: deliveredByFilter } }
      : {};

  // Boolean computed: has_signature (derived from signature_url IS NOT NULL)
  const hasSignatureFilter = state.filters['has_signature'];
  let hasSignatureWhere: Record<string, unknown> = {};
  if (Array.isArray(hasSignatureFilter) && hasSignatureFilter.length > 0) {
    if (hasSignatureFilter.includes('true') && !hasSignatureFilter.includes('false')) {
      hasSignatureWhere = { signature_url: { not: null } };
    } else if (hasSignatureFilter.includes('false') && !hasSignatureFilter.includes('true')) {
      hasSignatureWhere = { signature_url: null };
    }
    // If both are selected, no filter needed (all records)
  }

  // Text filter: employee_file (legajo del receptor)
  const employeeFileValues = state.filters['employee_file'];
  const employeeFileSearch = employeeFileValues?.[0]?.trim();
  let employeeFileWhere: Record<string, unknown> = {};
  if (employeeFileSearch) {
    employeeFileWhere = {
      employees_clothing_deliveries_employee_idToemployees: {
        file: { contains: employeeFileSearch, mode: 'insensitive' },
      },
    };
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
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...employeeWhere,
    ...deliveredByWhere,
    ...hasSignatureWhere,
    ...employeeFileWhere,
    ...deliveredByFileWhere,
    ...buildDeliveryStockWhere(state.filters, canViewPrices),
  };
}

// ============================================================================
// PRISMA SELECT
// ============================================================================

const deliverySelect = {
  id: true,
  employee_id: true,
  delivered_by_id: true,
  delivery_type: true,
  signature_url: true,
  notes: true,
  ...DELIVERY_STOCK_SELECT,
  delivered_at: true,
  created_at: true,
  updated_at: true,
  employees_clothing_deliveries_employee_idToemployees: {
    select: { id: true, firstname: true, lastname: true, file: true },
  },
  employees_clothing_deliveries_delivered_by_idToemployees: {
    select: { id: true, firstname: true, lastname: true, file: true },
  },
  clothing_delivery_items: {
    include: {
      clothing_items: true,
      clothing_brands: true,
      clothing_sizes: true,
    },
  },
} as const;

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getClothingReportsPaginated(searchParams: DataTableSearchParams) {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state, canViewPrices);

    // Safe orderBy: multi-sort con FK_SORT_MAP
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
        select: deliverySelect,
      }),
      prisma.clothing_deliveries.count({ where }),
    ]);

    return { data: data.map((row) => serializeDeliveryCost(row, canViewPrices)), total };
  } catch (error) {
    logger.error('Error al obtener reportes de entregas paginados', { data: { error } });
    throw new Error(`Error al obtener los reportes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllClothingReportsForExport(searchParams: DataTableSearchParams) {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state, canViewPrices);

    const data = await prisma.clothing_deliveries.findMany({
      orderBy: [{ delivered_at: 'desc' }],
      where,
      select: deliverySelect,
    });

    return data.map((row) => serializeDeliveryCost(row, canViewPrices));
  } catch (error) {
    logger.error('Error al exportar reportes de entregas', { data: { error } });
    throw new Error('Error al exportar los reportes');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getClothingReportsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);
  const baseWhere = { company_id: companyId };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified, canViewPrices);
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
    // ── delivery_type — enum ──────────────────────────────────────────────────
    if (columnId === 'delivery_type') {
      const where = crossWhere('delivery_type');
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['delivery_type'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.delivery_type, count: r._count }))),
      };
    }

    // ── status — virtual (cancelled_at) ───────────────────────────────────────
    if (columnId === 'status') {
      const where = crossWhere('status');
      const [active, cancelled] = await Promise.all([
        prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: null } }),
        prisma.clothing_deliveries.count({ where: { ...where, cancelled_at: { not: null } } }),
      ]);
      const counts = new Map<string, number>();
      if (active > 0) counts.set(DELIVERY_STATUS_ACTIVE, active);
      if (cancelled > 0) counts.set(DELIVERY_STATUS_CANCELLED, cancelled);
      return { counts };
    }

    // ── warehouse — FK nullable ───────────────────────────────────────────────
    if (columnId === 'warehouse') {
      const where = crossWhere('warehouse');
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

    // ── employee — FK ─────────────────────────────────────────────────────────
    if (columnId === 'employee') {
      const where = crossWhere('employee');
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['employee_id'],
        where,
        _count: true,
      });
      const employeeIds = rows.map((r) => r.employee_id);
      const employees = await prisma.employees.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstname: true, lastname: true, file: true },
      });

      const counts = toFacetMap(rows.map((r) => ({ key: r.employee_id, count: r._count })));
      const resolvedOptions = employees.map((emp) => ({
        id: emp.id,
        name: `[${emp.file ?? ''}] ${emp.lastname} ${emp.firstname}`,
      }));

      return { counts, resolvedOptions };
    }

    // ── delivered_by — FK ─────────────────────────────────────────────────────
    if (columnId === 'delivered_by') {
      const where = crossWhere('delivered_by');
      const rows = await prisma.clothing_deliveries.groupBy({
        by: ['delivered_by_id'],
        where,
        _count: true,
      });
      const employeeIds = rows.map((r) => r.delivered_by_id).filter((id): id is string => id != null);
      const employees = await prisma.employees.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstname: true, lastname: true, file: true },
      });

      const counts = toFacetMap(rows.map((r) => ({ key: r.delivered_by_id, count: r._count })));
      const resolvedOptions = employees.map((emp) => ({
        id: emp.id,
        name: `[${emp.file ?? ''}] ${emp.lastname} ${emp.firstname}`,
      }));

      return { counts, resolvedOptions };
    }

    // ── has_signature — computed boolean ───────────────────────────────────────
    if (columnId === 'has_signature') {
      const where = crossWhere('has_signature');

      const [withSignature, withoutSignature] = await Promise.all([
        prisma.clothing_deliveries.count({
          where: { ...where, signature_url: { not: null } },
        }),
        prisma.clothing_deliveries.count({
          where: { ...where, signature_url: null },
        }),
      ]);

      const counts = new Map<string, number>();
      if (withSignature > 0) counts.set('true', withSignature);
      if (withoutSignature > 0) counts.set('false', withoutSignature);

      return { counts };
    }

    logger.warn('Facet column not recognized for clothing reports', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de reportes', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ClothingReportListItem = Awaited<ReturnType<typeof getClothingReportsPaginated>>['data'][number];
