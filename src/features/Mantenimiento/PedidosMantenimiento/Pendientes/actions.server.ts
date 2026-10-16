'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isPendingAttentionKey } from '../constants';
import {
  ORDER_LIST_EXPORT_MAX_ROWS,
  PENDING_LIST_DEFAULT_STATUS,
  assembleOrdersWhere,
  descriptionTextCondition,
  getResourceFacet,
  orderListExportTooLargeMessage,
  pendingAttentionCondition,
  resolveOrderListScope,
  resourceIdsCondition,
  resourceOrderBy,
  resourceSearchCondition,
  scopeConditions,
} from '../lib/order-list-shared';

const logger = new Logger('PedidosMantenimiento/Pendientes');

// ── Campos válidos para ordenamiento ──────────────────────────────────────────
// Solo campos REALES de la tabla maintenance_orders
const VALID_SORT_FIELDS = new Set([
  'status',
  'created_at',
  'scheduled_date',
  'order_number',
  'source',
  // Columna resuelta via resourceOrderBy (vehículo o equipamiento)
  'vehicle',
]);

// ── Columnas de texto con filtro individual ────────────────────────────────────
const TEXT_COLUMNS = ['order_number'];

// ── Columnas con filtro de rango de fechas ─────────────────────────────────────
const DATE_COLUMNS = ['created_at', 'scheduled_date'];

// ── Estados que esta lista puede mostrar ───────────────────────────────────────
const PENDING_STATUSES = ['pending_scheduling', 'scheduled'];

// ── Lista blanca de filtros (todo lo demás que venga en la URL se descarta) ────
const ALLOWED_FILTERS = new Set([
  'status',
  'source',
  'vehicle',
  'description',
  // Filtro virtual de las tarjetas de métricas (no es una columna): ver `pendingAttentionCondition`
  'attention',
  ...TEXT_COLUMNS,
  ...dateRangeKeys(DATE_COLUMNS),
]);

const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'pedidos_pendientes';

// ── Select de campos compartido ───────────────────────────────────────────────
const PENDING_ORDER_SELECT = {
  id: true,
  status: true,
  created_at: true,
  scheduled_date: true,
  // Marca "Fecha rechazada" de la columna Estado: la fecha propuesta no se aprobó y el pedido volvió a programarse
  date_rejected_at: true,
  date_rejection_reason: true,
  source: true,
  preventive_type: true,
  order_number: true,
  description: true,
  equipment_id: true,
  other_equipment_id: true,
  maintenance_request_id: true,
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
    },
  },
  // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
  other_equipment: {
    select: {
      id: true,
      serial_number: true,
      intern_number: true,
    },
  },
  maintenance_requests: {
    select: {
      id: true,
      supervisor_id: true,
      description: true,
    },
  },
  _count: {
    select: {
      maintenance_order_items: true,
    },
  },
} as const;

// ── buildWhereClause — Helper DRY compartido ─────────────────────────────────
// Usado por las 3 funciones: paginated, export y facets. Todo va dentro de un único `AND`.
async function buildWhereClause(
  companyId: string,
  state: ReturnType<typeof parseSearchParams>,
  { allStatuses = false }: { allStatuses?: boolean } = {}
) {
  const scope = await resolveOrderListScope(companyId);
  const filters = sanitizeFilters(state, ALLOWED_FILTERS).filters;

  // Estado: el del usuario (acotado a los de esta lista) o, por defecto, solo "pendiente de planificar".
  // La faceta de estado ve ambos para poder ofrecer los dos con su conteo.
  const statusValues = (filters.status ?? []).filter((v) => PENDING_STATUSES.includes(v));
  const statusCondition = statusValues.length
    ? { status: { in: statusValues } }
    : allStatuses
      ? { status: { in: PENDING_STATUSES } }
      : { status: PENDING_LIST_DEFAULT_STATUS };

  // Columnas simples (origen). `status`, `vehicle` y `description` se resuelven a mano.
  const filtersWhere = buildFiltersWhere(
    filters,
    { source: 'source' },
    { exclude: ['status', 'vehicle', 'description', 'attention', ...TEXT_COLUMNS, ...dateRangeKeys(DATE_COLUMNS)] }
  );

  const extra: Record<string, unknown>[] = [statusCondition];
  if (state.search) extra.push(resourceSearchCondition(state.search));
  if (filters.vehicle?.length) extra.push(resourceIdsCondition(filters.vehicle));
  if (filters.description?.[0]) extra.push(descriptionTextCondition(filters.description[0]));
  // Atención (virtual): la MISMA condición que cuenta la tarjeta de métricas
  const attention = filters.attention?.[0];
  if (isPendingAttentionKey(attention)) extra.push(pendingAttentionCondition(attention));

  return assembleOrdersWhere({
    scope: scopeConditions(scope),
    extra,
    filtersWhere,
    simple: [buildTextFiltersWhere(filters, TEXT_COLUMNS), buildDateRangeFiltersWhere(filters, DATE_COLUMNS)],
  });
}

// ── Query paginada ────────────────────────────────────────────────────────────

export async function getPendingOrdersPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver los pedidos pendientes');
  }

  logger.debug('Obteniendo pedidos pendientes paginados');

  try {
    const companyId = await getActiveCompanyId();

    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = await buildWhereClause(companyId, state);

    // Ordenamiento validado: solo campos reales
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        if (s.id === 'vehicle') resolvedSorts.push(...resourceOrderBy(dir));
        else resolvedSorts.push({ [s.id]: dir });
      }
    }
    // El usuario espera ver primero lo ultimo que cargo: dentro de cada status,
    // del mas reciente al mas viejo. El status sigue siendo el criterio primario.
    const safeOrderBy = [
      ...(resolvedSorts.length > 0 ? resolvedSorts : [{ status: 'desc' as const }, { created_at: 'desc' as const }]),
      { id: 'asc' as const },
    ];

    const [data, total] = await Promise.all([
      prisma.maintenance_orders.findMany({
        where,
        skip,
        take,
        orderBy: safeOrderBy,
        select: PENDING_ORDER_SELECT,
      }),
      prisma.maintenance_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener pedidos pendientes', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ── Export completo (sin paginación, con tope) ───────────────────────────────

export async function getAllPendingOrdersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PendingOrderListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los pedidos pendientes' };
  }

  logger.debug('Exportando pedidos pendientes');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);

    const data = await prisma.maintenance_orders.findMany({
      where,
      // Mismo orden que la tabla: status primero, luego lo mas reciente arriba.
      orderBy: [{ status: 'desc' as const }, { created_at: 'desc' as const }, { id: 'asc' as const }],
      select: PENDING_ORDER_SELECT,
      take: ORDER_LIST_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > ORDER_LIST_EXPORT_MAX_ROWS) {
      return { ok: false, message: orderListExportTooLargeMessage('pedidos pendientes') };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar pedidos pendientes', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista. Intente nuevamente.' };
  }
}

// ── Faceta individual (lazy-load, con cross-filtering) ─────────────────────────
// Carga counts + opciones de UNA sola columna, bajo demanda (al abrir el popover del filtro correspondiente).

export async function getPendingOrdersSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  logger.debug('Obteniendo facet individual de pedidos pendientes', { data: { columnId } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams || {});

    // Excluye el filtro de la columna propia para que los counts sean correctos
    const where = await buildWhereClause(companyId, withoutOwnFilter(state, columnId), {
      allStatuses: columnId === 'status',
    });

    switch (columnId) {
      case 'status': {
        const rows = await prisma.maintenance_orders.groupBy({ by: ['status'], where, _count: { _all: true } });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count._all }))) };
      }

      case 'source': {
        const rows = await prisma.maintenance_orders.groupBy({ by: ['source'], where, _count: { _all: true } });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.source, count: r._count._all }))) };
      }

      case 'vehicle':
        return await getResourceFacet(where);

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet individual de pedidos pendientes', { data: { error, columnId } });
    return { counts: new Map() };
  }
}

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type PendingOrderListItem = Awaited<ReturnType<typeof getPendingOrdersPaginated>>['data'][number];
