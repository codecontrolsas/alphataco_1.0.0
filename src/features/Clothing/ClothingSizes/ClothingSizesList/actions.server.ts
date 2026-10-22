'use server';

import { buildClothingCatalogWhere, isActiveFacet } from '@/features/Clothing/lib/catalog-list-query';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { parseSearchParams, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { createCrossWhere } from '@/shared/lib/table-facets';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Clothing/ClothingSizes/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at', 'updated_at']);

const TEXT_FILTER_COLUMNS = ['name'];

const DATE_RANGE_COLUMNS = ['created_at'];

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  return buildClothingCatalogWhere(companyId, state, {
    searchColumns: ['name'],
    textColumns: TEXT_FILTER_COLUMNS,
    dateColumns: DATE_RANGE_COLUMNS,
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getClothingSizesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    // Build safe orderBy
    const sortField = state.sorting[0]?.id;
    const sortDir = state.sorting[0]?.desc ? ('desc' as const) : ('asc' as const);
    const orderBy =
      sortField && VALID_SORT_FIELDS.has(sortField) ? [{ [sortField]: sortDir }] : [{ name: 'asc' as const }];

    const where = buildWhereClause(companyId, state);

    const [data, total] = await Promise.all([
      prisma.clothing_sizes.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          name: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.clothing_sizes.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener talles paginados', { data: { error } });
    throw new Error('Error al obtener los talles');
  }
}

export type ClothingSizeListItem = Awaited<ReturnType<typeof getClothingSizesPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY
// ============================================================================

export async function getAllClothingSizesForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const data = await prisma.clothing_sizes.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar talles', { data: { error } });
    throw new Error('Error al exportar los talles');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getClothingSizesSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await getActiveCompanyId();
  const crossWhere = createCrossWhere<Prisma.clothing_sizesWhereInput>(
    searchParams,
    { company_id: companyId },
    (state) => buildWhereClause(companyId, state)
  );

  try {
    if (columnId === 'is_active') {
      const rows = await prisma.clothing_sizes.groupBy({
        by: ['is_active'],
        where: crossWhere('is_active'),
        _count: true,
      });
      return isActiveFacet(rows);
    }

    logger.warn('getClothingSizesSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener faceta de talles', { data: { error, columnId } });
    return null;
  }
}
