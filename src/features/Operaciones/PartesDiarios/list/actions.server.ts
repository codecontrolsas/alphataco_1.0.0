'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('PartesDiarios/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de dailyreport que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['date', 'creation_date', 'status', 'is_active', 'created_at']);

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['date', 'creation_date'];

/**
 * Mapping de columnId (URL) → campo real en Prisma.
 * Las columnas de tipo enum y booleano se mapean directamente.
 */
const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  is_active: 'is_active',
};

/**
 * Únicas claves de URL que filtran la tabla (`tab`, `subtab`, `company_id`, etc. se descartan): evita que
 * una clave arbitraria llegue a `buildFiltersWhere` como campo de Prisma.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Estado de la tabla ya parseado y con solo los filtros permitidos. */
function parseListState(searchParams: DataTableSearchParams) {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Construye el WHERE clause compartido entre paginated, export y facets.
 * Centraliza la lógica para que no se duplique. El perímetro de empresa va en un `AND` propio: ningún
 * filtro puede pisarlo.
 */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseListState>): Prisma.dailyreportWhereInput {
  // La tabla no tiene columnas de texto buscables: con una lista vacía `buildSearchWhere` devolvería `OR: []`
  // (cero filas en Prisma), así que la búsqueda global no se aplica.

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: ['is_active', ...dateRangeKeys(DATE_RANGE_COLUMNS)],
  });

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // is_active (booleano nullable): con ambos valores seleccionados no se filtra; con uno, se filtra por ese.
  const isActiveValues = new Set(state.filters['is_active'] ?? []);
  const isActiveWhere: Prisma.dailyreportWhereInput =
    isActiveValues.has('true') !== isActiveValues.has('false') ? { is_active: isActiveValues.has('true') } : {};

  return {
    AND: [
      { company_id: companyId },
      filtersWhere as Prisma.dailyreportWhereInput,
      dateFiltersWhere as Prisma.dailyreportWhereInput,
      isActiveWhere,
    ],
  };
}

// ============================================================================
// SELECT COMÚN
// ============================================================================

const DAILY_REPORT_SELECT = {
  id: true,
  date: true,
  creation_date: true,
  status: true,
  is_active: true,
  created_at: true,
} as const;

/** Cantidad de líneas por estado de cada parte (`{ pendiente: 3, ejecutado: 5 }`). */
type StatusCounts = Record<string, number>;

/**
 * Agrega a cada parte el conteo de sus líneas por estado con UN `groupBy` (en vez de traer todas
 * las filas con solo su `status`). Los partes sin líneas quedan con `{}`.
 */
async function withStatusCounts<T extends { id: string }>(
  reports: T[]
): Promise<(T & { statusCounts: StatusCounts })[]> {
  if (reports.length === 0) return [];

  const grouped = await prisma.dailyreportrows.groupBy({
    by: ['daily_report_id', 'status'],
    where: { daily_report_id: { in: reports.map((report) => report.id) } },
    _count: { _all: true },
  });

  const byReport = new Map<string, StatusCounts>();
  for (const group of grouped) {
    if (!group.daily_report_id) continue;
    const counts = byReport.get(group.daily_report_id) ?? {};
    counts[group.status] = group._count._all;
    byReport.set(group.daily_report_id, counts);
  }

  return reports.map((report) => ({ ...report, statusCounts: byReport.get(report.id) ?? {} }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getDailyReportsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);

    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, state);

    // Multi-sort — solo campos válidos, inactivos siempre al final
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        resolvedSorts.push({ [s.id]: dir });
      }
    }

    // Inactivos al final (is_active: true antes que false), fallback a date desc
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...(resolvedSorts.length > 0 ? resolvedSorts : [{ date: 'desc' as const }]),
    ];

    const [reports, total] = await Promise.all([
      prisma.dailyreport.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: DAILY_REPORT_SELECT,
      }),
      prisma.dailyreport.count({ where }),
    ]);

    const data = await withStatusCounts(reports);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener partes diarios paginados', { data: { error } });
    throw new Error('No se pudo obtener la lista de partes diarios. Intente nuevamente.');
  }
}

export type DailyReportListItem = Awaited<ReturnType<typeof getDailyReportsPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllDailyReportsForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy = [{ is_active: 'desc' as const }, { date: 'desc' as const }, { id: 'asc' as const }];

    // Por tandas y con tope (EXPORT_MAX_ROWS): no se materializa la tabla entera de una sola vez.
    const reports = await fetchExportRowsInBatches({
      listIds: (take) => prisma.dailyreport.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) => prisma.dailyreport.findMany({ where: { id: { in: ids } }, select: DAILY_REPORT_SELECT }),
      tooLargeMessage: tooManyRowsMessage('partes'),
    });

    const data = await withStatusCounts(reports);
    return { ok: true, data } satisfies ExportResult<typeof data>;
  } catch (error) {
    logger.error('Error al exportar partes diarios', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en producción.
    const message =
      error instanceof ExportTooLargeError
        ? error.message
        : 'No se pudo exportar la lista de partes diarios. Intente nuevamente.';
    return { ok: false, message } satisfies ExportResult<never>;
  }
}

// ============================================================================
// FACETS
// ============================================================================

/**
 * Conteos por estado y por activo/inactivo de TODOS los partes de la empresa, sin filtros del usuario.
 * Lo usan solo las tarjetas de métricas (una vez por carga); los filtros de la tabla piden su faceta
 * individual con `getDailyReportSingleFacet`.
 */
export async function getDailyReportFacets() {
  const companyId = await getActiveCompanyId();
  const where = { company_id: companyId };

  try {
    const [statusCounts, isActiveCounts] = await Promise.all([
      prisma.dailyreport.groupBy({ by: ['status'], where, _count: true }),
      prisma.dailyreport.groupBy({ by: ['is_active'], where, _count: true }),
    ]);

    return {
      status: toFacetMap(statusCounts.map((r) => ({ key: r.status as string, count: r._count }))),
      is_active: toFacetMap(isActiveCounts.map((r) => ({ key: r.is_active, count: r._count }))),
    };
  } catch (error) {
    logger.error('Error al obtener facets de partes diarios', { data: { error } });
    return null;
  }
}

export type DailyReportFacets = Awaited<ReturnType<typeof getDailyReportFacets>>;

/**
 * Faceta de UNA columna de la tabla (lazy-load: se pide al abrir el filtro). Los conteos excluyen el
 * filtro propio de la columna (cross-filter). Devuelve `null` si la columna no tiene faceta o falla.
 */
export async function getDailyReportSingleFacet(columnId: string, searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'status': {
        const rows = await prisma.dailyreport.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status as string, count: r._count }))) };
      }
      case 'is_active': {
        const rows = await prisma.dailyreport.groupBy({ by: ['is_active'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.is_active, count: r._count }))) };
      }
      default:
        logger.warn('columnId no soportado en getDailyReportSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de partes diarios', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CONTEOS DE ATENCIÓN (solo lectura)
// ============================================================================

/**
 * Cantidad de partes de la empresa activa con al menos una línea pendiente y con al menos
 * una línea sin recursos. Cuenta partes (no líneas), sin filtros del usuario.
 * Devuelve `null` si la consulta falla, para que la tarjeta muestre "—" en vez de un cero falso.
 */
export async function getDailyReportAttentionCounts() {
  const companyId = await getActiveCompanyId();

  try {
    const [withPending, withoutResources] = await Promise.all([
      prisma.dailyreport.count({
        where: { company_id: companyId, dailyreportrows: { some: { status: 'pendiente' } } },
      }),
      prisma.dailyreport.count({
        where: { company_id: companyId, dailyreportrows: { some: { status: 'sin_recursos_asignados' } } },
      }),
    ]);

    return { withPending, withoutResources };
  } catch (error) {
    logger.error('Error al obtener los conteos de atención de partes diarios', { data: { error } });
    return null;
  }
}

export type DailyReportAttentionCounts = Awaited<ReturnType<typeof getDailyReportAttentionCounts>>;
