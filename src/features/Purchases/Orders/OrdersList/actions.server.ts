'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { profileFacetOptions } from '@/shared/lib/table-facet-lookups';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import {
  containsInsensitive as contains,
  countDistinctRelations,
  isOneOf,
  isUuidOrNull,
  parseValidatedListState,
  profileDisplayName,
  resolveSorts,
  uniqueSortedByNumber,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { supplierFacetOptions } from '../../lib/list-facet-lookups';
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

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: isOneOf(PURCHASE_ORDER_STATUSES),
  supplier: isUuid,
  creator: isUuid,
  approver: isUuidOrNull,
  requests: isUuid,
};

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
  const state = parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
  if (!canViewPrices) {
    delete state.filters[TOTAL_FILTER];
    state.sorting = state.sorting.filter((s) => s.id !== 'total');
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

function shape(rows: Prisma.purchase_ordersGetPayload<{ select: typeof ORDER_SELECT }>[], canViewPrices: boolean) {
  return rows.map((r) => {
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
      creator: { id: r.creator.id, name: profileDisplayName(r.creator) },
      approver: r.approver ? { id: r.approver.id, name: profileDisplayName(r.approver) } : null,
      requests: uniqueSortedByNumber(r.lines.map((l) => l.request_line.request)),
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

    const orderBy: OrderOrderBy[] = [
      ...resolveSorts<OrderOrderBy>(state.sorting, VALID_SORT_FIELDS, FK_SORT_MAP),
      { created_at: 'desc' },
      { number: 'desc' },
    ];

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
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const canViewPrices = await canViewPurchasePrices('ordenes');
  const parsed =
    searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams, canViewPrices) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): OrderWhere {
    return buildWhereClause(
      companyId as string,
      withoutOwnFilter(parsed ?? parseListState({}, canViewPrices), excludeColumn)
    );
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['supplier_id'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: await supplierFacetOptions(rows.map((r) => r.supplier_id)),
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'approver') {
      const rows = await prisma.purchase_orders.groupBy({ by: ['approved_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.approved_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.flatMap((r) => (r.approved_by ? [r.approved_by] : []))),
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
      return countDistinctRelations(orders.map((o) => o.lines.map((l) => l.request_line.request)));
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
