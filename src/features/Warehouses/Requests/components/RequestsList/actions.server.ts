'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getPurchaseRequestsForMaterialRequest } from '@/features/Purchases/actions/request-queries.server';
import { destinationSearchConditions } from '@/features/Warehouses/lib/destination-search';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { profileFacetOptions } from '@/shared/lib/table-facet-lookups';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import {
  isOneOf,
  isUuidOrNull,
  parseValidatedListState,
  profileDisplayName,
  resolveSorts,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { isUuid } from '@/shared/lib/uuid';
import { getMaterialRequestDetail } from '../../../actions/requests.server';
import { DESTINATION_SELECT, destinationLabel } from '../../../lib/labels';
import {
  requestScopeConditions,
  resolveRequestScope as resolveScope,
  type RequestScope as Scope,
} from '../../../lib/request-scope';
import { MATERIAL_REQUEST_STATUSES } from '../../../lib/request-state-machine';
import { STOCK_DESTINATION_TYPES } from '../../../schemas/stock-movement';

const logger = new Logger('features/Warehouses/Requests/RequestsList');

type RequestWhere = Prisma.material_requestsWhereInput;
type RequestOrderBy = Prisma.material_requestsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Ordenables: numero, estado, tipo de destino y fecha (campos directos) + solicitante y quien
 * decidio (FK). NO ordenables: `destination` (calculado desde varias relaciones) y `progress`
 * (derivado de las entregas, no es un campo de la base).
 */
const VALID_SORT_FIELDS = new Set(['number', 'status', 'destination_type', 'created_at']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => RequestOrderBy> = {
  requester: (dir) => ({ requester: { fullname: dir } }),
  decider: (dir) => ({ decider: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number'];
const DATE_RANGE_COLUMNS = ['created_at'];

/** Columnas con filtro facetado (pasan por `buildFiltersWhere`). */
const FACETED_COLUMNS = ['status', 'requester', 'destination_type', 'decider'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  requester: 'requested_by',
  decider: 'decided_by',
};

/** `destination` es un filtro de texto que se resuelve a mano (varias relaciones). */
const DESTINATION_FILTER = 'destination';

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  DESTINATION_FILTER,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: isOneOf(MATERIAL_REQUEST_STATUSES),
  destination_type: (v) => v === NULL_FILTER_VALUE || (STOCK_DESTINATION_TYPES as readonly string[]).includes(v),
  requester: isUuid,
  decider: isUuidOrNull,
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** WHERE compartido entre paginated, export y facets (incluye la visibilidad). */
function buildWhereClause(scope: Scope, state: FilterState): RequestWhere {
  const f = state.filters;
  // Empresa + visibilidad (sin `view_all_requests` solo los pedidos propios): alcance compartido
  const and: RequestWhere[] = requestScopeConditions(scope);

  and.push(buildSearchWhere(state.search, ['number', 'notes']) as RequestWhere);
  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...TEXT_FILTER_COLUMNS, DESTINATION_FILTER] }) as RequestWhere);
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as RequestWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as RequestWhere);

  // Destino (texto): mismo criterio que el filtro `destination` de Movimientos
  const dest = f[DESTINATION_FILTER]?.[0]?.trim();
  if (dest) {
    and.push({
      OR: destinationSearchConditions(dest),
    });
  }

  return { AND: and };
}

const REQUEST_SELECT = {
  id: true,
  number: true,
  status: true,
  created_at: true,
  notes: true,
  requester: { select: { id: true, fullname: true, email: true } },
  decider: { select: { id: true, fullname: true, email: true } },
  ...DESTINATION_SELECT,
} as const;

/**
 * Avance de los pedidos de la pagina SIN N+1: una sola query agregada. Una linea esta
 * completamente entregada cuando Σ(−direction × quantity) de sus lineas de stock >= quantity.
 */
async function getProgressByRequest(requestIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  if (requestIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ request_id: string; total: number; done: number }[]>`
    SELECT l.request_id,
           COUNT(*)::int AS total,
           (COUNT(*) FILTER (WHERE COALESCE(d.delivered, 0) >= l.quantity))::int AS done
    FROM material_request_lines l
    LEFT JOIN (
      SELECT sml.request_line_id, SUM(-sml.direction * sml.quantity) AS delivered
      FROM stock_movement_lines sml
      JOIN material_request_lines mrl ON mrl.id = sml.request_line_id
      WHERE mrl.request_id = ANY(${requestIds}::uuid[])
      GROUP BY sml.request_line_id
    ) d ON d.request_line_id = l.id
    WHERE l.request_id = ANY(${requestIds}::uuid[])
    GROUP BY l.request_id
  `;
  return new Map(rows.map((r) => [r.request_id, { done: r.done, total: r.total }]));
}

async function shape(rows: Prisma.material_requestsGetPayload<{ select: typeof REQUEST_SELECT }>[]) {
  const progress = await getProgressByRequest(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    created_at: r.created_at,
    notes: r.notes,
    destination_type: r.destination_type,
    destination: destinationLabel(r),
    requester: { id: r.requester.id, name: profileDisplayName(r.requester) },
    decider: r.decider ? { id: r.decider.id, name: profileDisplayName(r.decider) } : null,
    progress: progress.get(r.id) ?? { done: 0, total: 0 },
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getRequestsPaginated(searchParams: DataTableSearchParams) {
  const scope = await resolveScope();
  if (!scope) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(scope, state);

    const orderBy: RequestOrderBy[] = [
      ...resolveSorts<RequestOrderBy>(state.sorting, VALID_SORT_FIELDS, FK_SORT_MAP),
      { created_at: 'desc' },
      { number: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.material_requests.findMany({ where, orderBy, skip, take, select: REQUEST_SELECT }),
      prisma.material_requests.count({ where }),
    ]);
    return { data: await shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener pedidos', { data: { error } });
    throw new Error('No se pudo obtener la lista de pedidos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllRequestsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<RequestListItem[]>> {
  const scope = await resolveScope();
  if (!scope) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(scope, state);
    const orderBy: RequestOrderBy[] = [{ created_at: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.material_requests.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.material_requests.findMany({
          where: { id: { in: ids }, company_id: scope.companyId },
          select: REQUEST_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} pedidos con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: await shape(rows) };
  } catch (error) {
    logger.error('Error al exportar pedidos', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de pedidos. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getRequestSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const scope = await resolveScope();
  if (!scope) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): RequestWhere {
    return buildWhereClause(scope as Scope, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.material_requests.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'destination_type') {
      const rows = await prisma.material_requests.groupBy({ by: ['destination_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.destination_type, count: r._count }))) };
    }

    if (columnId === 'requester') {
      const rows = await prisma.material_requests.groupBy({ by: ['requested_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.requested_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.requested_by)),
      };
    }

    if (columnId === 'decider') {
      const rows = await prisma.material_requests.groupBy({ by: ['decided_by'], where, _count: true });
      const ids = rows.map((r) => r.decided_by).filter((id): id is string => id != null);
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.decided_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(ids),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de pedidos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCION (banda sobre la tabla)
// ============================================================================

/** Estados "en curso de entrega": aprobado o entregado en parte, sin cerrar. */
const AWAITING_DELIVERY_STATUSES = ['APPROVED', 'PARTIALLY_DELIVERED'] as const;

/**
 * Pedidos que esperan una accion del usuario. Cada numero usa el alcance de la lista y el mismo estado que
 * el filtro de la banda, asi coincide con el total de la tabla filtrada. Solo se cuenta lo que el usuario
 * puede hacer (aprobar / entregar). Nunca rechaza: `null` si no se pudo contar (la banda no se muestra).
 */
export async function getRequestsAttention(): Promise<{ pendingApproval: number; toDeliver: number } | null> {
  try {
    const scope = await resolveScope();
    if (!scope) return null;
    const [canApprove, canDeliver] = await Promise.all([
      checkPermissionServer('almacenes', 'pedidos', 'approve'),
      checkPermissionServer('almacenes', 'pedidos', 'update'),
    ]);
    const base = requestScopeConditions(scope);
    const [pendingApproval, toDeliver] = await Promise.all([
      canApprove ? prisma.material_requests.count({ where: { AND: [...base, { status: 'PENDING_APPROVAL' }] } }) : 0,
      canDeliver
        ? prisma.material_requests.count({
            where: { AND: [...base, { status: { in: [...AWAITING_DELIVERY_STATUSES] } }] },
          })
        : 0,
    ]);
    return { pendingApproval, toDeliver };
  } catch (error) {
    logger.error('Error al contar pedidos que esperan accion', { data: { error } });
    return null;
  }
}

// ============================================================================
// DETALLE (panel lateral)
// ============================================================================

/** Pedido + sus solicitudes de compra, lo que muestra el panel lateral (igual que la pagina de detalle). */
export async function getRequestDetailForSheet(id: string) {
  const request = await getMaterialRequestDetail(id);
  if (!request) return null;
  const [items, canCreate] = await Promise.all([
    getPurchaseRequestsForMaterialRequest(request.id),
    checkPermissionServer('compras', 'solicitudes', 'create'),
  ]);
  return { request, purchases: { items, canCreate } };
}

// ============================================================================
// TIPOS
// ============================================================================

export type RequestListItem = Awaited<ReturnType<typeof getRequestsPaginated>>['data'][number];
