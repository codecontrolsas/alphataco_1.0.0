'use server';

import {
  buildNullableEmployeeIdWhere,
  buildPersonFileWhere,
  createCrossWhere,
  DELIVERED_BY_RELATION,
  DELIVERY_ITEMS_SELECT,
  DELIVERY_PERSON_SELECT,
  deliveryPersonFacet,
  deliveryStatusFacet,
  deliveryTypeFacet,
  RECIPIENT_RELATION,
} from '@/features/Clothing/lib/delivery-list-query';
import { buildDeliveryStatusWhere, DELIVERY_STATUS_SELECT } from '@/features/Clothing/lib/delivery-stock-where';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { resolveSorts, type SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Clothing/AllDeliveries/actions.server');

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
  'employee_id',
  'employee_file',
  'status',
];

/** Mapeo de columnas FK para ordenamiento server-side */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.clothing_deliveriesOrderByWithRelationInput> = {
  delivered_by_id: (dir) => ({
    employees_clothing_deliveries_delivered_by_idToemployees: { lastname: dir },
  }),
  employee_id: (dir) => ({
    employees_clothing_deliveries_employee_idToemployees: { lastname: dir },
  }),
  status: (dir) => ({ cancelled_at: dir }),
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Construye el SELECT compartido entre paginated, export y facets.
 */
const DELIVERY_SELECT = {
  id: true,
  delivery_type: true,
  delivered_at: true,
  notes: true,
  signature_url: true,
  ...DELIVERY_STATUS_SELECT,
  [RECIPIENT_RELATION]: DELIVERY_PERSON_SELECT,
  [DELIVERED_BY_RELATION]: DELIVERY_PERSON_SELECT,
  clothing_delivery_items: DELIVERY_ITEMS_SELECT,
} as const;

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  // Búsqueda global: notas + nombre completo del empleado destinatario
  const searchTerm = state.search?.trim();
  const searchWhere: Record<string, unknown> = searchTerm
    ? {
        OR: [
          { notes: { contains: searchTerm, mode: 'insensitive' as const } },
          {
            employees_clothing_deliveries_employee_idToemployees: {
              full_name: { contains: searchTerm, mode: 'insensitive' as const },
            },
          },
        ],
      }
    : {};

  const filtersWhere = buildFiltersWhere(state.filters, {}, { exclude: MANUALLY_HANDLED_COLUMNS });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...buildNullableEmployeeIdWhere('employee_id', state.filters['employee_id']),
    ...buildPersonFileWhere(RECIPIENT_RELATION, state.filters['employee_file']),
    ...buildNullableEmployeeIdWhere('delivered_by_id', state.filters['delivered_by_id']),
    ...buildPersonFileWhere(DELIVERED_BY_RELATION, state.filters['delivered_by_file']),
    ...buildDeliveryStatusWhere(state.filters),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getAllDeliveriesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos
    const safeOrderBy = [
      ...resolveSorts<Prisma.clothing_deliveriesOrderByWithRelationInput>(
        state.sorting,
        VALID_SORT_FIELDS,
        FK_SORT_MAP
      ),
      { delivered_at: 'desc' as const },
    ];

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

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener todas las entregas paginadas', { data: { error } });
    throw new Error(`Error al obtener las entregas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllDeliveriesForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const data = await prisma.clothing_deliveries.findMany({
      orderBy: [{ delivered_at: 'desc' }],
      where,
      select: DELIVERY_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar todas las entregas', { data: { error } });
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
export async function getAllDeliveriesSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await getActiveCompanyId();
  const crossWhere = createCrossWhere(searchParams, { company_id: companyId }, (state) =>
    buildWhereClause(companyId, state)
  );

  try {
    const where = crossWhere(columnId);

    if (columnId === 'delivery_type') return await deliveryTypeFacet(where);
    if (columnId === 'status') return await deliveryStatusFacet(where);
    if (columnId === 'employee_id' || columnId === 'delivered_by_id') return await deliveryPersonFacet(columnId, where);

    logger.warn('Facet column not recognized for all deliveries', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de todas las entregas', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type AllDeliveryListItem = Awaited<ReturnType<typeof getAllDeliveriesPaginated>>['data'][number];
