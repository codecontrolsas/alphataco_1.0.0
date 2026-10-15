'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
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
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { PURCHASE_ORDER_STATUSES } from '../../lib/order-state-machine';
import { maskAmount } from '../../lib/price-visibility';
import { canViewPurchasePrices } from '../../lib/price-visibility.server';
import { formatCuit } from '../../lib/supplier-ids';

const logger = new Logger('features/Purchases/Orders/OrdersList');

type OrderWhere = Prisma.purchase_ordersWhereInput;
type OrderOrderBy = Prisma.purchase_ordersOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). `supplier` / `creator` / `approver` se resuelven en FK_SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['number', 'status', 'created_at', 'delivery_date', 'sent_at', 'total']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => OrderOrderBy> = {
  supplier: (dir) => ({ supplier: { name: dir } }),
  creator: (dir) => ({ creator: { fullname: dir } }),
  approver: (dir) => ({ approver: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number'];
const DATE_RANGE_COLUMNS = ['created_at', 'delivery_date', 'sent_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['status', 'supplier', 'creator', 'approver'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  supplier: 'supplier_id',
  creator: 'created_by',
  approver: 'approved_by',
};

/** Filtros de texto/propios que no pasan por `buildFiltersWhere`. */
const TOTAL_FILTER = 'total';
const REQUESTS_FILTER = 'requests';

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  TOTAL_FILTER,
  REQUESTS_FILTER,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: (v) => (PURCHASE_ORDER_STATUSES as readonly string[]).includes(v),
  supplier: (v) => UUID_RE.test(v),
  creator: (v) => UUID_RE.test(v),
  approver: (v) => v === NULL_FILTER_VALUE || UUID_RE.test(v),
  requests: (v) => UUID_RE.test(v),
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('compras', 'ordenes', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/**
 * Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. Sin
 * `view_prices` se descartan el filtro y el orden por total: filtrar por un importe exacto lo revelaria.
 */
function parseListState(searchParams: DataTableSearchParams, canViewPrices: boolean) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  if (!canViewPrices) {
    delete state.filters[TOTAL_FILTER];
    state.sorting = state.sorting.filter((s) => s.id !== 'total');
  }
  for (const [column, isValid] of Object.entries(VALID_VALUES)) {
    const values = state.filters[column];
    if (!values) continue;
    const valid = values.filter(isValid);
    if (valid.length > 0) state.filters[column] = valid;
    else delete state.filters[column];
  }
  return state;
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): OrderWhere {
  const f = state.filters;
  const and: OrderWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { supplier: { OR: [{ name: contains(search) }, { trade_name: contains(search) }] } },
      ],
    });
  }

  and.push(
    buildFiltersWhere(f, COLUMN_MAP, { exclude: [...TEXT_FILTER_COLUMNS, TOTAL_FILTER, REQUESTS_FILTER] }) as OrderWhere
  );
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as OrderWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as OrderWhere);

  // Total (Decimal): `contains` no existe en numericos, se busca el importe exacto ("1250,50" o "1250.50")
  const totalText = f[TOTAL_FILTER]?.[0]?.trim();
  if (totalText) {
    // Con coma es formato es-AR (puntos de miles); sin coma es un decimal comun
    const exact = Number(totalText.includes(',') ? totalText.replace(/\./g, '').replace(',', '.') : totalText);
    // Importe invalido: ninguna orden coincide (en vez de ignorar el filtro y mostrar todo)
    and.push(Number.isFinite(exact) ? { total: exact } : { id: { in: [] } });
  }

  // Solicitudes de origen (M:M via lineas)
  const requestIds = f[REQUESTS_FILTER] ?? [];
  if (requestIds.length > 0) {
    and.push({ lines: { some: { request_line: { request_id: { in: requestIds } } } } });
  }

  return { AND: and };
}

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  created_at: true,
  delivery_date: true,
  sent_at: true,
  total: true,
  supplier: { select: { id: true, name: true, cuit: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  approver: { select: { id: true, fullname: true, email: true } },
  lines: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } },
} as const;

const profileName = (p: { fullname: string | null; email: string | null }) => p.fullname ?? p.email ?? '-';

function shape(rows: Prisma.purchase_ordersGetPayload<{ select: typeof ORDER_SELECT }>[], canViewPrices: boolean) {
  return rows.map((r) => {
    const requests = new Map<string, { id: string; number: string }>();
    for (const l of r.lines) requests.set(l.request_line.request.id, l.request_line.request);

    return {
      id: r.id,
      number: r.number,
      status: r.status,
      created_at: r.created_at,
      delivery_date: r.delivery_date,
      sent_at: r.sent_at,
      // Decimal -> string (no se serializa a client components). Sin `view_prices`, null.
      total: maskAmount(r.total.toFixed(2), canViewPrices),
      supplier: { id: r.supplier.id, name: r.supplier.name, cuit: formatCuit(r.supplier.cuit) },
      creator: { id: r.creator.id, name: profileName(r.creator) },
      approver: r.approver ? { id: r.approver.id, name: profileName(r.approver) } : null,
      requests: [...requests.values()].sort((a, b) => a.number.localeCompare(b.number)),
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPurchaseOrdersPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0, canViewPrices: false };

  try {
    const canViewPrices = await canViewPurchasePrices('ordenes');
    const state = parseListState(searchParams, canViewPrices);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: OrderOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: OrderOrderBy[] = [...resolvedSorts, { created_at: 'desc' }, { number: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.purchase_orders.findMany({ where, orderBy, skip, take, select: ORDER_SELECT }),
      prisma.purchase_orders.count({ where }),
    ]);
    return { data: shape(rows, canViewPrices), total, canViewPrices };
  } catch (error) {
    logger.error('Error al obtener ordenes de compra', { data: { error } });
    throw new Error('No se pudo obtener la lista de órdenes de compra');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllPurchaseOrdersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PurchaseOrderListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const canViewPrices = await canViewPurchasePrices('ordenes');
    const state = parseListState(searchParams, canViewPrices);
    const where = buildWhereClause(companyId, state);
    const orderBy: OrderOrderBy[] = [{ created_at: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.purchase_orders.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.purchase_orders.findMany({ where: { id: { in: ids }, company_id: companyId }, select: ORDER_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} órdenes de compra con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows, canViewPrices) };
  } catch (error) {
    logger.error('Error al exportar ordenes de compra', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en produccion.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de órdenes de compra. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPurchaseOrderSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const canViewPrices = await canViewPurchasePrices('ordenes');
  const parsed =
    searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams, canViewPrices) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): OrderWhere {
    const base: FilterState = parsed ?? parseListState({}, canViewPrices);
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  async function profileOptions(ids: string[]) {
    if (ids.length === 0) return [];
    const profiles = await prisma.profile.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullname: true, email: true },
      orderBy: { fullname: 'asc' },
    });
    return profiles.map((p) => ({ id: p.id, name: profileName(p) }));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['supplier_id'], where, _count: true });
      const ids = rows.map((r) => r.supplier_id);
      const suppliers = ids.length
        ? await prisma.suppliers.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: suppliers,
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'approver') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['approved_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.approved_by, count: r._count }))),
        resolvedOptions: await profileOptions(rows.flatMap((r) => (r.approved_by ? [r.approved_by] : []))),
      };
    }

    if (columnId === 'requests') {
      // M:M: cuantas ordenes (distintas) tiene cada solicitud de origen
      const orders = await prisma.purchase_orders.findMany({
        where,
        select: {
          lines: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } },
        },
      });
      const counts = new Map<string, number>();
      const names = new Map<string, string>();
      for (const o of orders) {
        const seen = new Set<string>();
        for (const l of o.lines) {
          const req = l.request_line.request;
          names.set(req.id, req.number);
          if (!seen.has(req.id)) {
            seen.add(req.id);
            counts.set(req.id, (counts.get(req.id) ?? 0) + 1);
          }
        }
      }
      const resolvedOptions = [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { counts, resolvedOptions };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de ordenes de compra', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCION (bandas sobre la tabla)
// ============================================================================

/**
 * Órdenes que esperan una acción del usuario, con el mismo `where` que la lista filtrada por estado (y que el
 * contador de la sub-navegación): por aprobar (`ordenes:approve`) y por enviar al proveedor (`ordenes:send`). Nunca rechaza: `null` si no corresponde o no se pudo contar (no se muestra la banda).
 */
export async function getPurchaseOrdersAttention(): Promise<{
  pendingApproval: number | null;
  toSend: number | null;
} | null> {
  try {
    const [canApprove, canSend] = await Promise.all([
      checkPermissionServer('compras', 'ordenes', 'approve'),
      checkPermissionServer('compras', 'ordenes', 'send'),
    ]);
    if (!canApprove && !canSend) return null;
    if (!(await checkPermissionServer('compras', 'ordenes', 'view'))) return null;
    const companyId = await getActiveCompanyId();
    const [pendingApproval, toSend] = await Promise.all([
      canApprove
        ? prisma.purchase_orders.count({ where: { company_id: companyId, status: 'PENDING_APPROVAL' } })
        : null,
      canSend ? prisma.purchase_orders.count({ where: { company_id: companyId, status: 'APPROVED' } }) : null,
    ]);
    return { pendingApproval, toSend };
  } catch (error) {
    logger.error('Error al contar ordenes de compra que requieren atención', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type PurchaseOrderListItem = Awaited<ReturnType<typeof getPurchaseOrdersPaginated>>['data'][number];
