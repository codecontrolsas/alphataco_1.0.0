'use server';

import { assertTireBrandInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { syncTireMaterials } from '@/features/Warehouses/lib/tire-materials';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Marcas');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

const TEXT_FILTER_COLUMNS: string[] = [];

const DATE_RANGE_COLUMNS = ['created_at'];

// ============================================================================
// INTERNAL WHERE BUILDER
// ============================================================================

function buildTireBrandsWhereClause(state: ReturnType<typeof parseSearchParams>, companyId?: string) {
  const searchWhere = buildSearchWhere(state.search, ['name']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [...TEXT_FILTER_COLUMNS, ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`])],
    }
  );

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & { AND?: unknown };

  return {
    ...(companyId ? { company_id: companyId } : {}),
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...(filtersWhereAndConditions.length > 0 ? { AND: filtersWhereAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTireBrandsPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Fetching tire brands paginated');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildTireBrandsWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        resolvedSorts.push({ [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_brands.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          is_active: true,
          created_at: true,
          _count: { select: { tires: true } },
        },
      }),
      prisma.tire_brands.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tire brands paginated', { data: { error } });
    throw new Error(`Error al obtener las marcas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY
// ============================================================================

export async function getTireBrandsForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exporting tire brands');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = buildTireBrandsWhereClause(state, companyId);

    const data = await prisma.tire_brands.findMany({
      orderBy: [{ name: 'asc' }],
      where,
      select: {
        id: true,
        name: true,
        is_active: true,
        created_at: true,
        _count: { select: { tires: true } },
      },
    });

    return data;
  } catch (error) {
    logger.error('Error exporting tire brands', { data: { error } });
    throw new Error('Error al exportar las marcas');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

export async function getTireBrandSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  let companyId: string;
  try {
    companyId = await getActiveCompanyId();
  } catch {
    return null;
  }

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
    return buildTireBrandsWhereClause(modified, companyId);
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

    // ── Boolean: is_active ─────────────────────────────────────────────────
    if (columnId === 'is_active') {
      const rows = await prisma.tire_brands.groupBy({
        by: ['is_active'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))),
      };
    }

    logger.warn('getTireBrandSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error getting tire brand single facet', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================

/** Alta de marca: la empresa sale de la sesión, no del formulario. */
export async function createTireBrand(data: { name: string }) {
  logger.debug('Creating tire brand', { data: { name: data.name } });
  try {
    const companyId = await getActiveCompanyId();
    const existing = await prisma.tire_brands.findFirst({
      where: { name: data.name, company_id: companyId },
    });
    if (existing) {
      throw new Error(`Ya existe una marca con el nombre "${data.name}"`);
    }
    // Cada combinacion tipo + marca es un material de Almacenes (etapa 6): se crean juntos.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.create({ data: { name: data.name, company_id: companyId } });
      await syncTireMaterials(tx, companyId);
      return brand;
    });
  } catch (error) {
    logger.error('Error creating tire brand', { data: { error } });
    throw error;
  }
}

export async function updateTireBrand(id: string, data: { name: string }) {
  logger.debug('Updating tire brand', { data: { id, ...data } });
  try {
    await assertTireBrandInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.update({
        where: { id },
        data: { name: data.name },
      });
      await syncTireMaterials(tx, brand.company_id);
      return brand;
    });
  } catch (error) {
    logger.error('Error updating tire brand', { data: { error, id } });
    throw error;
  }
}

export async function toggleTireBrandActive(id: string, isActive: boolean) {
  logger.debug('Toggling tire brand active', { data: { id, isActive } });
  try {
    await assertTireBrandInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const brand = await tx.tire_brands.update({
        where: { id },
        data: { is_active: isActive },
      });
      await syncTireMaterials(tx, brand.company_id);
      return brand;
    });
  } catch (error) {
    logger.error('Error toggling tire brand active', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type TireBrandListItem = Awaited<ReturnType<typeof getTireBrandsPaginated>>['data'][number];
