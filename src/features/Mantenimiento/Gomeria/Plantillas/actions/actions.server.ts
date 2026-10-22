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
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';

/**
 * Listado de plantillas de cubiertas del dashboard (paginado y export).
 * Lectura = `view` de la pestaña `plantillas_cubiertas` (módulo `mantenimiento`).
 * Las plantillas no tienen filtros facetados (solo texto y fecha), así que no hay facetas.
 */

const logger = new Logger('features/Mantenimiento/Gomeria/Plantillas');

// ============================================================================
// TYPES
// ============================================================================

export interface AxleInput {
  axle_number: number;
  tires_per_side: number;
  tire_size: string | null;
  is_drive_axle: boolean;
  is_spare: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  description: true,
  company_id: true,
  is_active: true,
  created_at: true,
  _count: {
    select: { axles: true },
  },
  axles: {
    select: {
      id: true,
      axle_number: true,
      tires_per_side: true,
      tire_size: true,
      is_drive_axle: true,
      is_spare: true,
    },
    orderBy: { axle_number: 'asc' as const },
  },
} as const;

const VALID_SORT_FIELDS = new Set(['name', 'created_at']);

const TEXT_FILTER_COLUMNS = ['name', 'description'];
const DATE_RANGE_COLUMNS = ['created_at'];

const ALLOWED_FILTER_KEYS = new Set([...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

type ListState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// WHERE
// ============================================================================

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/** Perímetro (empresa + activas), búsqueda y filtros dentro de UN solo `AND`. */
function buildWhereClause(state: ListState, companyId: string) {
  return composeAnd<Prisma.tire_templatesWhereInput>(
    { company_id: companyId, is_active: true },
    buildSearchWhere(state.search, ['name', 'description']),
    buildFiltersWhere(state.filters, {}, { exclude: [...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)] }),
    buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS)
  );
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTemplatesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await requireGomeriaPermission('plantillas_cubiertas', 'view');

  try {
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_templates.findMany({ skip, take, orderBy: safeOrderBy, where, select: TEMPLATE_SELECT }),
      prisma.tire_templates.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tire templates paginated', { data: { error } });
    throw new Error('Error al obtener las plantillas');
  }
}

// ============================================================================
// EXPORT QUERY (con tope)
// ============================================================================

export async function getTemplatesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<TemplateListItem[]>> {
  let companyId: string;
  try {
    companyId = await requireGomeriaPermission('plantillas_cubiertas', 'view');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar las plantillas' };
  }

  try {
    const where = buildWhereClause(parseListState(searchParams), companyId);

    const data = await prisma.tire_templates.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      where,
      select: TEMPLATE_SELECT,
      take: GOMERIA_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > GOMERIA_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(GOMERIA_EXPORT_MAX_ROWS, 'plantillas') };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error exporting tire templates', { data: { error } });
    return { ok: false, message: 'Error al exportar las plantillas' };
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type TemplateListItem = Awaited<ReturnType<typeof getTemplatesPaginated>>['data'][number];
