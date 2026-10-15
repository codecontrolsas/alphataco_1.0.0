'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
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
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('KPIs/Indicadores/actions.server');

/** Tope de filas de una exportación. */
const EXPORT_MAX_ROWS = 10_000;

/** Lectura de Indicadores: exige `view` en Configuración › KPIs › Indicadores (las escrituras ya exigen create/update). */
async function assertCanViewIndicators() {
  if (!(await checkPermissionServer('configuracion', 'indicadores', 'view'))) {
    throw new Error('No tenés permiso para ver los indicadores');
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla kpis que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'code',
  'name',
  'number',
  'validity_date',
  'calculation_formula',
  'improvement_opportunities',
  'is_active',
  'technical_support',
  'created_at',
]);

/** Columnas con filtro de texto libre (contains insensitive) */
const TEXT_COLUMNS = ['name', 'code', 'number', 'calculation_formula', 'improvement_opportunities'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['validity_date', 'created_at'];

/** Select compartido para todas las queries */
const KPI_SELECT = {
  id: true,
  code: true,
  name: true,
  number: true,
  validity_date: true,
  calculation_formula: true,
  improvement_opportunities: true,
  is_active: true,
  technical_support: true,
  created_at: true,
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['code', 'name']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [
        ...TEXT_COLUMNS,
        'is_active',
        'technical_support',
        ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      ],
    }
  );

  // is_active: convierte string 'true'/'false' a boolean
  const isActiveValues = state.filters['is_active'];
  const isActiveFilter: Record<string, unknown> = {};
  if (isActiveValues?.length) {
    const boolValues = isActiveValues.map((v) => v === 'true');
    if (boolValues.length === 1) {
      isActiveFilter.is_active = boolValues[0];
    }
    // Limpiar del filtersWhere (manejamos manualmente)
    delete (filtersWhere as Record<string, unknown>)['is_active'];
  }

  // technical_support: convierte string 'true'/'false' a boolean
  const technicalSupportValues = state.filters['technical_support'];
  const technicalSupportFilter: Record<string, unknown> = {};
  if (technicalSupportValues?.length) {
    const boolValues = technicalSupportValues.map((v) => v === 'true');
    if (boolValues.length === 1) {
      technicalSupportFilter.technical_support = boolValues[0];
    }
    delete (filtersWhere as Record<string, unknown>)['technical_support'];
  }

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhere,
    ...isActiveFilter,
    ...technicalSupportFilter,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getKpisPaginated(searchParams: DataTableSearchParams) {
  await assertCanViewIndicators();
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        resolvedSorts.push({ [s.id]: dir });
      }
    }
    // Inactivos siempre al final, luego por code asc como tiebreaker
    const safeOrderBy = [...resolvedSorts, { is_active: 'desc' as const }, { code: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.kpis.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: KPI_SELECT,
      }),
      prisma.kpis.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener KPIs paginados', { data: { error } });
    throw new Error(`Error al obtener los KPIs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (todos los datos, sin paginación)
// ============================================================================

export async function getAllKpisForExport(searchParams: DataTableSearchParams): Promise<ExportResult<KpiListItem[]>> {
  if (!(await checkPermissionServer('configuracion', 'indicadores', 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los indicadores' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    // Una fila de más para detectar que se superó el tope sin traer todo.
    const data = await prisma.kpis.findMany({
      orderBy: [{ is_active: 'desc' }, { code: 'asc' }],
      where,
      select: KPI_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (data.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar KPIs', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista. Intente nuevamente.' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getKpisSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  await assertCanViewIndicators();
  const companyId = await getActiveCompanyId();
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
    return buildWhereClause(companyId, modified);
  }

  function toFacetMap(rows: { key: string | boolean | null | undefined; count: number }[]): Map<string, number> {
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

    // ── Boolean: is_active ──
    if (columnId === 'is_active') {
      const rows = await prisma.kpis.groupBy({ by: ['is_active'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.is_active, count: r._count }))),
      };
    }

    // ── Boolean: technical_support ──
    if (columnId === 'technical_support') {
      const rows = await prisma.kpis.groupBy({ by: ['technical_support'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.technical_support, count: r._count }))),
      };
    }

    logger.warn('Facet column no reconocida en KPIs', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de KPI', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type KpiListItem = Awaited<ReturnType<typeof getKpisPaginated>>['data'][number];
