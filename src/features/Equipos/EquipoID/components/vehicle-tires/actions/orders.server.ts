'use server';

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
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { requireTiresViewAccess } from '../lib/guards.server';

const logger = new Logger('features/Equipos/VehicleTires/Orders');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tope de filas del export: más que esto se pide acotar con filtros. */
const MAX_EXPORT_ROWS = 10_000;

/** columnId (URL) → campo de Prisma. */
const COLUMN_MAP: Record<string, string> = { status: 'status', creator: 'created_by' };
const TEXT_COLUMNS = ['kilometer'];
const DATE_RANGE_COLUMNS = ['service_date', 'closed_at'];

/**
 * Únicas claves de URL que filtran la tabla (`tab`, `company_id`, etc. se descartan): una clave arbitraria
 * no puede llegar a `buildFiltersWhere` como campo de Prisma.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...TEXT_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Columnas ordenables server-side (lista blanca) → su `orderBy` de Prisma. */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.tire_service_ordersOrderByWithRelationInput> = {
  service_date: (dir) => ({ service_date: dir }),
  status: (dir) => ({ status: dir }),
  kilometer: (dir) => ({ kilometer: dir }),
  closed_at: (dir) => ({ closed_at: dir }),
  created_at: (dir) => ({ created_at: dir }),
  creator: (dir) => ({ creator: { fullname: dir } }),
};

const ORDER_LIST_SELECT = {
  id: true,
  service_date: true,
  kilometer: true,
  status: true,
  closed_at: true,
  created_at: true,
  created_by: true,
  vehicle_id: true,
  trailer_vehicle_id: true,
  creator: { select: { id: true, fullname: true } },
  _count: { select: { items: true } },
} satisfies Prisma.tire_service_ordersSelect;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function parseListState(searchParams: DataTableSearchParams) {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/**
 * WHERE compartido entre paginated, export y facets. La empresa y el equipo van en `AND` propio: ningún
 * filtro puede pisarlos. `excludeColumn` aplica el cross-filter de las facetas.
 */
function buildOrdersWhereClause(
  companyId: string,
  vehicleId: string,
  state: ReturnType<typeof parseListState>,
  excludeColumn?: string
) {
  const excludeOpts = excludeColumn ? { exclude: [excludeColumn] } : undefined;

  const searchWhere = buildSearchWhere(state.search, TEXT_COLUMNS);
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, excludeOpts);
  const dateRangeWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);
  const textWhere = buildTextFiltersWhere(
    state.filters,
    TEXT_COLUMNS.filter((column) => column !== excludeColumn)
  );

  return {
    AND: [
      { company_id: companyId },
      { OR: [{ vehicle_id: vehicleId }, { trailer_vehicle_id: vehicleId }] },
      searchWhere,
      filtersWhere,
      dateRangeWhere,
      textWhere,
    ].filter((w) => Object.keys(w).length > 0),
  };
}

// ============================================================================
// ORDERS DATATABLE
// ============================================================================

export async function getVehicleTireOrdersPaginated(vehicleId: string, searchParams: DataTableSearchParams) {
  logger.debug('Getting paginated tire orders for vehicle', { data: { vehicleId } });

  try {
    const companyId = await requireTiresViewAccess(vehicleId);
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildOrdersWhereClause(companyId, vehicleId, state);

    const orderBy: Prisma.tire_service_ordersOrderByWithRelationInput[] = [];
    for (const sort of state.sorting ?? []) {
      const toOrderBy = Object.prototype.hasOwnProperty.call(SORT_MAP, sort.id) ? SORT_MAP[sort.id] : undefined;
      if (toOrderBy) orderBy.push(toOrderBy(sort.desc ? 'desc' : 'asc'));
    }
    if (orderBy.length === 0) orderBy.push({ service_date: 'desc' });
    // Desempate determinista para que la paginación no repita ni saltee filas.
    orderBy.push({ id: 'asc' });

    const [data, total] = await Promise.all([
      prisma.tire_service_orders.findMany({ where, skip, take, orderBy, select: ORDER_LIST_SELECT }),
      prisma.tire_service_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error getting tire orders for vehicle', { data: { error, vehicleId } });
    throw error;
  }
}

export type VehicleTireOrderItem = Awaited<ReturnType<typeof getVehicleTireOrdersPaginated>>['data'][number];

/**
 * Export con los filtros activos. Devuelve un `ExportResult` (no lanza): Next enmascara el mensaje de un
 * error lanzado desde una server action en producción. Tope: `MAX_EXPORT_ROWS` filas.
 */
export async function getVehicleTireOrdersForExport(
  vehicleId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<VehicleTireOrderItem[]>> {
  logger.debug('Getting tire orders for export', { data: { vehicleId } });

  try {
    const companyId = await requireTiresViewAccess(vehicleId);
    const state = parseListState(searchParams);
    const where = buildOrdersWhereClause(companyId, vehicleId, state);

    const rows = await prisma.tire_service_orders.findMany({
      where,
      orderBy: [{ service_date: 'desc' }, { id: 'asc' }],
      select: ORDER_LIST_SELECT,
      take: MAX_EXPORT_ROWS + 1,
    });

    if (rows.length > MAX_EXPORT_ROWS) {
      return {
        ok: false,
        message: `Hay más de ${MAX_EXPORT_ROWS.toLocaleString('es-AR')} órdenes con los filtros actuales. Acote la exportación con filtros.`,
      };
    }
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error exporting tire orders', { data: { error, vehicleId } });
    const message =
      error instanceof Error && error.message.startsWith('No tenés permiso')
        ? error.message
        : 'No se pudo exportar el historial de órdenes. Intente nuevamente.';
    return { ok: false, message };
  }
}

export async function getVehicleTireOrderSingleFacet(
  vehicleId: string,
  columnId: string,
  searchParams: DataTableSearchParams
) {
  logger.debug('Getting single facet for vehicle tire orders', { data: { vehicleId, columnId } });

  try {
    const companyId = await requireTiresViewAccess(vehicleId);
    const state = parseListState(searchParams);
    // Cross-filter: apply all filters EXCEPT the column being faceted
    const where = buildOrdersWhereClause(companyId, vehicleId, state, columnId);

    if (columnId === 'status') {
      const groups = await prisma.tire_service_orders.groupBy({
        by: ['status'],
        where,
        _count: true,
      });

      const counts = new Map(groups.map((g) => [g.status, g._count]));
      return { counts };
    }

    if (columnId === 'creator') {
      const groups = await prisma.tire_service_orders.groupBy({
        by: ['created_by'],
        where,
        _count: true,
      });

      const creators = await prisma.profile.findMany({
        where: { id: { in: groups.map((g) => g.created_by) } },
        select: { id: true, fullname: true },
      });

      const counts = new Map(groups.map((g) => [g.created_by, g._count]));
      const resolvedOptions = creators.map((c) => ({
        value: c.id,
        label: c.fullname ?? c.id,
      }));

      return { counts, resolvedOptions };
    }

    return { counts: new Map<string, number>() };
  } catch (error) {
    logger.error('Error getting tire order facet', { data: { error, vehicleId, columnId } });
    throw error;
  }
}
