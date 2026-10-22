'use server';

import { requireGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { composeAnd, GOMERIA_EXPORT_MAX_ROWS } from '@/features/Mantenimiento/Gomeria/shared/list-query';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportRowLimitMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';

/**
 * Listado de marcas de cubierta del dashboard (paginado, export y facetas).
 * Lectura = `view` de la pestaña `marcas_cubiertas` (módulo `mantenimiento`).
 */

const logger = new Logger('features/Mantenimiento/Gomeria/Marcas/list');

const BRAND_SELECT = {
  id: true,
  name: true,
  is_active: true,
  created_at: true,
  _count: { select: { tires: true } },
} as const;

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);
const DATE_RANGE_COLUMNS = ['created_at'];

/** `name` es filtro de texto; `is_active` es faceta; `created_at` es rango. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'name', ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

type ListState = ReturnType<typeof parseSearchParams>;

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ListState, companyId: string) {
  return composeAnd<Prisma.tire_brandsWhereInput>(
    { company_id: companyId },
    buildSearchWhere(state.search, ['name']),
    buildFiltersWhere(state.filters, {}, { exclude: ['name', ...dateRangeKeys(DATE_RANGE_COLUMNS)] }),
    buildTextFiltersWhere(state.filters, ['name']),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS)
  );
}

export async function getTireBrandsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await requireGomeriaPermission('marcas_cubiertas', 'view');

  try {
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
    }
    const safeOrderBy = [...resolvedSorts, { name: 'asc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_brands.findMany({ skip, take, orderBy: safeOrderBy, where, select: BRAND_SELECT }),
      prisma.tire_brands.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tire brands paginated', { data: { error } });
    throw new Error('Error al obtener las marcas');
  }
}

export type TireBrandListItem = Awaited<ReturnType<typeof getTireBrandsPaginated>>['data'][number];

export async function getTireBrandsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<TireBrandListItem[]>> {
  let companyId: string;
  try {
    companyId = await requireGomeriaPermission('marcas_cubiertas', 'view');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar las marcas' };
  }

  try {
    const where = buildWhereClause(parseListState(searchParams), companyId);
    const data = await prisma.tire_brands.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      where,
      select: BRAND_SELECT,
      take: GOMERIA_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > GOMERIA_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(GOMERIA_EXPORT_MAX_ROWS, 'marcas') };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error exporting tire brands', { data: { error } });
    return { ok: false, message: 'Error al exportar las marcas' };
  }
}

export async function getTireBrandSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (columnId !== 'is_active') {
    logger.warn('getTireBrandSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await requireGomeriaPermission('marcas_cubiertas', 'view');
    const where = buildWhereClause(withoutOwnFilter(parseListState(searchParams ?? {}), columnId), companyId);
    const rows = await prisma.tire_brands.groupBy({ by: ['is_active'], where, _count: true });
    return { counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))) };
  } catch (error) {
    logger.error('Error getting tire brand single facet', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
