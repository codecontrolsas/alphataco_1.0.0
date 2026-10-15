'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { nameActiveCreateSchema, nameActiveUpdateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/General/Hierarchy');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'name', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ReturnType<typeof parseState>, companyId: string) {
  return withCompany(
    {
      // La búsqueda y el filtro de estado pueden traer un OR cada uno: van en AND para que no se pisen.
      AND: [buildSearchWhere(state.search, ['name']), buildIsActiveWhere(state.filters['is_active'])],
      ...buildTextFiltersWhere(state.filters, ['name']),
      ...buildDateRangeFiltersWhere(state.filters, ['created_at']),
    },
    companyId
  );
}

const LIST_SELECT = { id: true, name: true, is_active: true, created_at: true } as const;

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getHierarchiesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(state, await getActiveCompanyId());

    // Resolución de multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.hierarchy.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.hierarchy.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener sectores del organigrama', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllHierarchiesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<HierarchyListItem[]>> {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const state = parseState(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(state, companyId);

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolvedSorts,
      { name: 'asc' as const },
      { id: 'asc' as const },
    ];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.hierarchy.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.hierarchy.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('sectores del organigrama'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar sectores del organigrama', { data: { error } });
    return catalogExportFailure(error, 'la lista de sectores del organigrama');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getHierarchySingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('organigrama', 'view');
  try {
    const state = parseState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = buildWhereClause(crossState, await getActiveCompanyId());

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.hierarchy.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          // is_active es Boolean? (nullable): el null se cuenta bajo NULL_FILTER_VALUE
          counts.set(r.is_active === null ? NULL_FILTER_VALUE : String(r.is_active), r._count);
        }

        return {
          options: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta del organigrama', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createHierarchyPrisma(data: { name: string; is_active: boolean }) {
  await requireConfigTabPermission('organigrama', 'create');
  data = nameActiveCreateSchema.parse(data);
  try {
    const result = await prisma.hierarchy.create({
      data: {
        name: data.name,
        is_active: data.is_active,
        company_id: await getActiveCompanyId(),
      },
      select: { id: true, name: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al crear sector del organigrama', { data: { error } });
    throw new Error('No se pudo crear el sector. Intente nuevamente.');
  }
}

export async function updateHierarchyPrisma(data: { id: string; name: string; is_active: boolean }) {
  await requireConfigTabPermission('organigrama', 'update');
  data = nameActiveUpdateSchema.parse(data);
  try {
    // Perímetro sin RLS: sólo filas de la empresa activa.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.hierarchy.findFirst({
      where: { id: data.id, company_id: companyId },
      select: { id: true },
    });
    if (!owned) throw new Error('No encontrado en la empresa activa');
    const result = await prisma.hierarchy.update({
      where: { id: data.id },
      data: {
        name: data.name,
        is_active: data.is_active,
      },
      select: { id: true, name: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al actualizar sector del organigrama', { data: { error } });
    throw new Error('No se pudo actualizar el sector. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type HierarchyListItem = Awaited<ReturnType<typeof getHierarchiesPaginated>>['data'][number];
