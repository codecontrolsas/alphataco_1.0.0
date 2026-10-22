'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { STOCK_DESTINATION_TYPES } from '@/features/Warehouses/schemas/stock-movement';
import { Prisma } from '@/generated/prisma/client';
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
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { DESTINATION_SELECT, destinationLabel } from '@/features/Warehouses/lib/labels';
import { orderedQuantitySql } from '../../lib/ordered-quantity-sql';
import {
  purchaseRequestScopeConditions,
  resolvePurchaseRequestScope as resolveScope,
  type PurchaseRequestScope as Scope,
} from '../../lib/request-scope';
import { PURCHASE_REQUEST_STATUSES } from '../../lib/request-state-machine';

const logger = new Logger('features/Purchases/Requests/RequestsList');

type RequestWhere = Prisma.purchase_requestsWhereInput;
type RequestOrderBy = Prisma.purchase_requestsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). `destination` y `lines` se resuelven aparte. */
const VALID_SORT_FIELDS = new Set(['number', 'status', 'destination_type', 'created_at', 'needed_by']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => RequestOrderBy> = {
  requester: (dir) => ({ requester: { fullname: dir } }),
  lines_count: (dir) => ({ lines: { _count: dir } }),
  material_request: (dir) => ({ material_request: { number: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number'];
const DATE_RANGE_COLUMNS = ['created_at', 'needed_by'];

/** Columnas con filtro facetado (pasan por `buildFiltersWhere`). */
const FACETED_COLUMNS = ['status', 'requester', 'destination_type'] as const;

/** Filtros de texto que se resuelven a mano (relaciones). */
const ORIGIN_FILTER = 'material_request';
const DESTINATION_FILTER = 'destination';

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  ORIGIN_FILTER,
  DESTINATION_FILTER,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: (v) => (PURCHASE_REQUEST_STATUSES as readonly string[]).includes(v),
  destination_type: (v) => v === NULL_FILTER_VALUE || (STOCK_DESTINATION_TYPES as readonly string[]).includes(v),
  requester: (v) => UUID_RE.test(v),
};

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  requester: 'requested_by',
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  for (const [column, isValid] of Object.entries(VALID_VALUES)) {
    const values = state.filters[column];
    if (!values) continue;
    const valid = values.filter(isValid);
    if (valid.length > 0) state.filters[column] = valid;
    else delete state.filters[column];
  }
  return state;
}

/** WHERE compartido entre paginated, export y facets (incluye la visibilidad). */
function buildWhereClause(scope: Scope, state: FilterState): RequestWhere {
  const f = state.filters;
  // Empresa + visibilidad (sin `view_all_requests` solo las propias): alcance compartido
  const and: RequestWhere[] = purchaseRequestScopeConditions(scope);

  and.push(buildSearchWhere(state.search, ['number', 'notes']) as RequestWhere);
  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...TEXT_FILTER_COLUMNS, ORIGIN_FILTER, DESTINATION_FILTER] }) as RequestWhere);
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as RequestWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as RequestWhere);

  // Pedido de origen (texto sobre su numero)
  const origin = f[ORIGIN_FILTER]?.[0]?.trim();
  if (origin) and.push({ material_request: { number: contains(origin) } });

  // Destino (texto): mismo criterio que el filtro `destination` de las solicitudes de Almacenes
  const dest = f[DESTINATION_FILTER]?.[0]?.trim();
  if (dest) {
    and.push({
      OR: [
        { employee: { OR: [{ file: contains(dest) }, { lastname: contains(dest) }, { firstname: contains(dest) }] } },
        { vehicle: { OR: [{ domain: contains(dest) }, { intern_number: contains(dest) }] } },
        { other_equipment: { intern_number: contains(dest) } },
        { maintenance_order: { order_number: contains(dest) } },
        { customer: { name: contains(dest) } },
      ],
    });
  }

  return { AND: and };
}

const REQUEST_SELECT = {
  id: true,
  number: true,
  status: true,
  created_at: true,
  needed_by: true,
  requester: { select: { id: true, fullname: true, email: true } },
  material_request: { select: { id: true, number: true } },
  _count: { select: { lines: true } },
  ...DESTINATION_SELECT,
} as const;

const profileName = (p: { fullname: string | null; email: string | null }) => p.fullname ?? p.email ?? '-';

/** Estados en los que "Avance" no tiene sentido (todavia no se puede pedir, o ya no se va a pedir). */
const NO_PROGRESS_STATUSES = new Set(['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED']);

/**
 * Avance (%) pedido en OC por solicitud, en UNA query agregada para toda la pagina (sin N+1):
 * Σ min(pedido en OC, cantidad de la linea) / Σ cantidad de las lineas.
 * El "pedido en OC" sale de `orderedQuantitySql` (definicion unica: las OC cerradas cuentan solo
 * por lo recibido).
 */
async function getOrderProgressByRequest(requestIds: string[]): Promise<Map<string, number>> {
  if (requestIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ request_id: string; progress: number | null }[]>(Prisma.sql`
    SELECT prl.request_id,
           ROUND(
             100 * SUM(LEAST(${orderedQuantitySql(Prisma.raw('prl.id'))}, prl.quantity)) / NULLIF(SUM(prl.quantity), 0)
           )::float8 AS progress
    FROM purchase_request_lines prl
    WHERE prl.request_id = ANY(${requestIds}::uuid[])
    GROUP BY prl.request_id
  `);
  return new Map(rows.map((r) => [r.request_id, Math.round(r.progress ?? 0)]));
}

async function shape(rows: Prisma.purchase_requestsGetPayload<{ select: typeof REQUEST_SELECT }>[]) {
  const progress = await getOrderProgressByRequest(
    rows.filter((r) => !NO_PROGRESS_STATUSES.has(r.status)).map((r) => r.id)
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    created_at: r.created_at,
    needed_by: r.needed_by,
    destination_type: r.destination_type,
    destination: destinationLabel(r),
    requester: { id: r.requester.id, name: profileName(r.requester), email: r.requester.email },
    material_request: r.material_request,
    lines_count: r._count.lines,
    // null = no aplica por el estado (borrador, pendiente, rechazada, anulada)
    progress: NO_PROGRESS_STATUSES.has(r.status) ? null : (progress.get(r.id) ?? 0),
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPurchaseRequestsPaginated(searchParams: DataTableSearchParams) {
  const scope = await resolveScope();
  if (!scope) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(scope, state);

    const resolvedSorts: RequestOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: RequestOrderBy[] = [...resolvedSorts, { created_at: 'desc' }, { number: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.purchase_requests.findMany({ where, orderBy, skip, take, select: REQUEST_SELECT }),
      prisma.purchase_requests.count({ where }),
    ]);
    return { data: await shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener solicitudes de compra', { data: { error } });
    throw new Error('No se pudo obtener la lista de solicitudes de compra');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllPurchaseRequestsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PurchaseRequestListItem[]>> {
  const scope = await resolveScope();
  if (!scope) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(scope, state);
    const orderBy: RequestOrderBy[] = [{ created_at: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.purchase_requests.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.purchase_requests.findMany({
          where: { id: { in: ids }, company_id: scope.companyId },
          select: REQUEST_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} solicitudes con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: await shape(rows) };
  } catch (error) {
    logger.error('Error al exportar solicitudes de compra', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en produccion.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de solicitudes de compra. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPurchaseRequestSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const scope = await resolveScope();
  if (!scope) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): RequestWhere {
    const base: FilterState = parsed ?? parseListState({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(scope as Scope, { ...base, filters });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.purchase_requests.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'destination_type') {
      const rows = await prisma.purchase_requests.groupBy({ by: ['destination_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.destination_type, count: r._count }))) };
    }

    if (columnId === 'requester') {
      const rows = await prisma.purchase_requests.groupBy({ by: ['requested_by'], where, _count: true });
      const ids = rows.map((r) => r.requested_by);
      const profiles = ids.length
        ? await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullname: true, email: true },
            orderBy: { fullname: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.requested_by, count: r._count }))),
        resolvedOptions: profiles.map((p) => ({ id: p.id, name: profileName(p) })),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de solicitudes de compra', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCION (banda sobre la tabla)
// ============================================================================

/**
 * Solicitudes pendientes de aprobación, para quien puede aprobar. Usa el alcance de la lista y el mismo
 * estado que el filtro de la banda, así coincide con el total de la tabla filtrada y con el contador de
 * la sub-navegación. Nunca rechaza: `null` si no corresponde o no se pudo contar (la banda no se muestra).
 */
export async function getPurchaseRequestsAttention(): Promise<{ pendingApproval: number } | null> {
  try {
    if (!(await checkPermissionServer('compras', 'solicitudes', 'approve'))) return null;
    const scope = await resolveScope();
    if (!scope) return null;
    const pendingApproval = await prisma.purchase_requests.count({
      where: { AND: [...purchaseRequestScopeConditions(scope), { status: 'PENDING_APPROVAL' }] },
    });
    return { pendingApproval };
  } catch (error) {
    logger.error('Error al contar solicitudes de compra pendientes de aprobación', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type PurchaseRequestListItem = Awaited<ReturnType<typeof getPurchaseRequestsPaginated>>['data'][number];
