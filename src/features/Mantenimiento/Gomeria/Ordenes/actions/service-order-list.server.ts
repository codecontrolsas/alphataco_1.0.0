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
 * Listado de órdenes de gomería del dashboard (paginado, export y facetas).
 *
 * Vive aparte de las acciones de escritura de las órdenes. Lectura = `view` de la pestaña
 * `ordenes_gomeria` (módulo `mantenimiento`); la empresa sale de la sesión.
 */

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/list');

// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_ORDER_SELECT = {
  id: true,
  vehicle_id: true,
  trailer_vehicle_id: true,
  kilometer: true,
  service_date: true,
  status: true,
  created_by: true,
  created_at: true,
  closed_at: true,
  vehicle: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
  trailer: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
  creator: { select: { id: true, fullname: true } },
  _count: { select: { items: true } },
} as const;

const VALID_SORT_FIELDS = new Set([
  'service_date',
  'kilometer',
  'status',
  'created_at',
  'closed_at',
  'vehicle_id',
  'trailer_vehicle_id',
  'created_by',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle_id: (dir) => ({ vehicle: { domain: dir } }),
  trailer_vehicle_id: (dir) => ({ trailer: { domain: dir } }),
  created_by: (dir) => ({ creator: { fullname: dir } }),
};

const FACET_COLUMNS = ['status', 'vehicle_id', 'trailer_vehicle_id', 'created_by'];
const TEXT_FILTER_COLUMNS = ['kilometer'];
const DATE_RANGE_COLUMNS = ['service_date', 'created_at'];

/** Únicas claves de filtro que la tabla entiende: el resto de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS = new Set([...FACET_COLUMNS, ...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

type ListState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// WHERE
// ============================================================================

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/** Perímetro, búsqueda y filtros dentro de UN solo `AND` (compartido por paginado, export y facetas). */
function buildWhereClause(state: ListState, companyId: string) {
  return composeAnd<Prisma.tire_service_ordersWhereInput>(
    { company_id: companyId },
    buildSearchWhere(state.search, ['kilometer']),
    buildFiltersWhere(state.filters, {}, { exclude: [...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)] }),
    buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS)
  );
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getServiceOrdersPaginated(searchParams: DataTableSearchParams) {
  const companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');

  try {
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_service_orders.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: SERVICE_ORDER_SELECT,
      }),
      prisma.tire_service_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching service orders paginated', { data: { error } });
    throw new Error('Error al obtener las órdenes de gomería');
  }
}

export type ServiceOrderListItem = Awaited<ReturnType<typeof getServiceOrdersPaginated>>['data'][number];

// ============================================================================
// OPEN ORDERS SUMMARY (banda "N órdenes abiertas")
// ============================================================================

/**
 * Cuántas órdenes de gomería siguen abiertas en la empresa activa y cuál es la última (la que se retoma con
 * "Continuar orden"). Mismo perímetro que el listado; solo `count` y una fila con los campos de la banda.
 */
export async function getOpenServiceOrdersSummary() {
  const companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');

  try {
    const where = composeAnd<Prisma.tire_service_ordersWhereInput>({ company_id: companyId }, { status: 'OPEN' });

    const [count, latest] = await Promise.all([
      prisma.tire_service_orders.count({ where }),
      prisma.tire_service_orders.findFirst({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          vehicle_id: true,
          trailer_vehicle_id: true,
          created_at: true,
          vehicle: { select: { domain: true } },
          trailer: { select: { domain: true } },
          creator: { select: { fullname: true } },
        },
      }),
    ]);

    return { count, latest };
  } catch (error) {
    logger.error('Error fetching open service orders summary', { data: { error } });
    throw new Error('Error al obtener las órdenes abiertas');
  }
}

// ============================================================================
// EXPORT QUERY (con tope)
// ============================================================================

export async function getServiceOrdersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<ServiceOrderListItem[]>> {
  let companyId: string;
  try {
    companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar las órdenes de gomería' };
  }

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(state, companyId);

    const data = await prisma.tire_service_orders.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      where,
      select: SERVICE_ORDER_SELECT,
      take: GOMERIA_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > GOMERIA_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(GOMERIA_EXPORT_MAX_ROWS, 'órdenes de gomería') };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error exporting service orders', { data: { error } });
    return { ok: false, message: 'Error al exportar las órdenes de gomería' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

type FacetOption = { id: string; name: string | null };

export async function getServiceOrderSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: FacetOption[] } | null> {
  if (!FACET_COLUMNS.includes(columnId)) {
    logger.warn('getServiceOrderSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');
    const state = withoutOwnFilter(parseListState(searchParams ?? {}), columnId);
    const where = buildWhereClause(state, companyId);

    if (columnId === 'status') {
      const rows = await prisma.tire_service_orders.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'vehicle_id' || columnId === 'trailer_vehicle_id') {
      const keys =
        columnId === 'vehicle_id'
          ? (await prisma.tire_service_orders.groupBy({ by: ['vehicle_id'], where, _count: true })).map((r) => ({
              key: r.vehicle_id as string | null,
              count: r._count,
            }))
          : (await prisma.tire_service_orders.groupBy({ by: ['trailer_vehicle_id'], where, _count: true })).map(
              (r) => ({ key: r.trailer_vehicle_id as string | null, count: r._count })
            );
      const counts = toFacetMap(keys);
      const ids = keys.map((r) => r.key).filter((id): id is string => id != null);
      const vehicles =
        ids.length > 0
          ? await prisma.vehicles.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, domain: true },
              orderBy: { domain: 'asc' },
            })
          : [];
      return { counts, resolvedOptions: vehicles.map((v) => ({ id: v.id, name: v.domain })) };
    }

    // created_by
    const rows = await prisma.tire_service_orders.groupBy({ by: ['created_by'], where, _count: true });
    const counts = toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count })));
    const ids = rows.map((r) => r.created_by).filter((id): id is string => id != null);
    const profiles =
      ids.length > 0
        ? await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullname: true },
            orderBy: { fullname: 'asc' },
          })
        : [];
    return { counts, resolvedOptions: profiles.map((p) => ({ id: p.id, name: p.fullname })) };
  } catch (error) {
    logger.error('Error getting service order single facet', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
