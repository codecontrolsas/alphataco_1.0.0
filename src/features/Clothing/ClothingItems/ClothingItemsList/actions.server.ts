'use server';

import { buildClothingCatalogWhere, isActiveFacet } from '@/features/Clothing/lib/catalog-list-query';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { parseSearchParams, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { createCrossWhere } from '@/shared/lib/table-facets';
import { resolveSorts, type SingleFacetResult } from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Clothing/ClothingItems/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla clothing_items que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['name', 'code', 'is_active', 'created_at', 'updated_at']);

/** Columnas que son filtros de texto libre */
const TEXT_FILTER_COLUMNS = ['name', 'code', 'description'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['created_at'];

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  return buildClothingCatalogWhere(companyId, state, {
    searchColumns: ['name', 'code'],
    textColumns: TEXT_FILTER_COLUMNS,
    dateColumns: DATE_RANGE_COLUMNS,
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getClothingItemsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos. Inactivos al final, luego por nombre
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolveSorts<Prisma.clothing_itemsOrderByWithRelationInput>(state.sorting, VALID_SORT_FIELDS),
      { name: 'asc' as const },
    ];

    const [data, total] = await Promise.all([
      prisma.clothing_items.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.clothing_items.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener artículos paginados', { data: { error } });
    throw new Error(`Error al obtener los artículos: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllClothingItemsForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const data = await prisma.clothing_items.findMany({
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      where,
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar artículos', { data: { error } });
    throw new Error('Error al exportar los artículos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getClothingItemsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await getActiveCompanyId();
  const crossWhere = createCrossWhere<Prisma.clothing_itemsWhereInput>(
    searchParams,
    { company_id: companyId },
    (state) => buildWhereClause(companyId, state)
  );

  try {
    if (columnId === 'is_active') {
      const rows = await prisma.clothing_items.groupBy({
        by: ['is_active'],
        where: crossWhere('is_active'),
        _count: true,
      });
      return isActiveFacet(rows);
    }

    logger.warn('Facet column not recognized for clothing items', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de artículos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ClothingItemListItem = Awaited<ReturnType<typeof getClothingItemsPaginated>>['data'][number];
