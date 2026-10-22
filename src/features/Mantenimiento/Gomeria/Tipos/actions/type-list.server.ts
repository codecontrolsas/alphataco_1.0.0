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
 * Listado de tipos de cubierta del dashboard (paginado, export y facetas).
 * Lectura = `view` de la pestaña `tipos_cubiertas` (módulo `mantenimiento`).
 */

const logger = new Logger('features/Mantenimiento/Gomeria/Tipos/list');

const TYPE_SELECT = {
  id: true,
  name: true,
  size: true,
  tread_type: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  _count: { select: { tires: true } },
} as const;

const VALID_SORT_FIELDS = new Set(['name', 'size', 'tread_type', 'is_active', 'created_at']);
const FACET_COLUMNS = ['is_active', 'tread_type'];
const TEXT_FILTER_COLUMNS = ['name', 'size'];
const DATE_RANGE_COLUMNS = ['created_at'];

const ALLOWED_FILTER_KEYS = new Set([...FACET_COLUMNS, ...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

type ListState = ReturnType<typeof parseSearchParams>;

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ListState, companyId: string) {
  return composeAnd<Prisma.tire_typesWhereInput>(
    { company_id: companyId },
    buildSearchWhere(state.search, ['name', 'size']),
    buildFiltersWhere(state.filters, {}, { exclude: [...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)] }),
    buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS)
  );
}

export async function getTireTypesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await requireGomeriaPermission('tipos_cubiertas', 'view');

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
      prisma.tire_types.findMany({ skip, take, orderBy: safeOrderBy, where, select: TYPE_SELECT }),
      prisma.tire_types.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tire types paginated', { data: { error } });
    throw new Error('Error al obtener los tipos de cubierta');
  }
}

export type TireTypeListItem = Awaited<ReturnType<typeof getTireTypesPaginated>>['data'][number];

export async function getTireTypesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<TireTypeListItem[]>> {
  let companyId: string;
  try {
    companyId = await requireGomeriaPermission('tipos_cubiertas', 'view');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar los tipos de cubierta' };
  }

  try {
    const where = buildWhereClause(parseListState(searchParams), companyId);
    const data = await prisma.tire_types.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      where,
      select: TYPE_SELECT,
      take: GOMERIA_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > GOMERIA_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(GOMERIA_EXPORT_MAX_ROWS, 'tipos de cubierta') };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error exporting tire types', { data: { error } });
    return { ok: false, message: 'Error al exportar los tipos de cubierta' };
  }
}

export async function getTireTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (!FACET_COLUMNS.includes(columnId)) {
    logger.warn('getTireTypeSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await requireGomeriaPermission('tipos_cubiertas', 'view');
    const where = buildWhereClause(withoutOwnFilter(parseListState(searchParams ?? {}), columnId), companyId);

    if (columnId === 'is_active') {
      const rows = await prisma.tire_types.groupBy({ by: ['is_active'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))) };
    }

    const rows = await prisma.tire_types.groupBy({ by: ['tread_type'], where, _count: true });
    return { counts: toFacetMap(rows.map((r) => ({ key: r.tread_type, count: r._count }))) };
  } catch (error) {
    logger.error('Error getting tire type single facet', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
