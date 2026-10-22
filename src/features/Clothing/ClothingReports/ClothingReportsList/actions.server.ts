'use server';

import {
  buildPersonFileWhere,
  createCrossWhere,
  DELIVERED_BY_RELATION,
  DELIVERY_PERSON_SELECT,
  deliveryPersonFacet,
  deliveryStatusFacet,
  deliveryTypeFacet,
  deliveryWarehouseFacet,
  RECIPIENT_RELATION,
} from '@/features/Clothing/lib/delivery-list-query';
import {
  buildDeliveryStockWhere,
  DELIVERY_STOCK_MANUAL_COLUMNS,
  DELIVERY_STOCK_SELECT,
  serializeDeliveryCost,
} from '@/features/Clothing/lib/delivery-stock-where';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { resolveSorts, type SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Clothing/ClothingReports/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de clothing_deliveries que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['delivery_type', 'delivered_at', 'created_at', 'signature_url', 'notes']);

/** FK sort map: columnId → Prisma orderBy */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.clothing_deliveriesOrderByWithRelationInput> = {
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

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...employeeWhere,
    ...deliveredByWhere,
    ...hasSignatureWhere,
    ...buildPersonFileWhere(RECIPIENT_RELATION, state.filters['employee_file']),
    ...buildPersonFileWhere(DELIVERED_BY_RELATION, state.filters['delivered_by_file']),
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
  [RECIPIENT_RELATION]: DELIVERY_PERSON_SELECT,
  [DELIVERED_BY_RELATION]: DELIVERY_PERSON_SELECT,
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
    const safeOrderBy = [
      ...resolveSorts<Prisma.clothing_deliveriesOrderByWithRelationInput>(state.sorting, VALID_SORT_FIELDS, {
        ...FK_SORT_MAP,
        // Ordenar por costo sin permiso permitiria deducir los importes.
        cost: (dir) => (canViewPrices ? { stock_movement: { total_cost: dir } } : []),
      }),
      { delivered_at: 'desc' as const },
    ];

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
): Promise<SingleFacetResult> {
  const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewDeliveryPrices()]);
  const crossWhere = createCrossWhere(searchParams, { company_id: companyId }, (state) =>
    buildWhereClause(companyId, state, canViewPrices)
  );

  try {
    if (columnId === 'delivery_type') return await deliveryTypeFacet(crossWhere('delivery_type'));
    if (columnId === 'status') return await deliveryStatusFacet(crossWhere('status'));
    if (columnId === 'warehouse') return await deliveryWarehouseFacet(crossWhere('warehouse'));
    if (columnId === 'employee') return await deliveryPersonFacet('employee_id', crossWhere('employee'));
    if (columnId === 'delivered_by') return await deliveryPersonFacet('delivered_by_id', crossWhere('delivered_by'));

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
