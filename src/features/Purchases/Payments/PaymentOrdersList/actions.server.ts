'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { payment_method } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
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
  containsInsensitive as contains,
  parseValidatedListState,
  profileDisplayName,
  resolveSorts,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { isUuid } from '@/shared/lib/uuid';
import { companyIdIfCanView } from '../../lib/list-access';
import { supplierFacetOptions } from '../../lib/list-facet-lookups';
import { parseAmountFilter } from '../../lib/list-filters';
import { PAYMENT_ORDER_STATUS_LABELS } from '../../lib/payment-order-state-machine';
import { getPaymentOrdersToApproveCount, getPaymentOrdersToPayCount } from '../../lib/section-counts';
import { formatCuit } from '../../lib/supplier-ids';
import { PAYMENT_METHOD_LABELS, PAYMENT_ORDERS_EXPORT_MAX_ROWS } from './constants';

const logger = new Logger('features/Purchases/Payments/PaymentOrdersList');

type OrderWhere = Prisma.payment_ordersWhereInput;
type OrderOrderBy = Prisma.payment_ordersOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set([
  'number',
  'planned_on',
  'paid_on',
  'status',
  'invoices_total',
  'credits_total',
  'advance_total',
  'withholdings_total',
  'net_total',
  'created_at',
]);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => OrderOrderBy[]> = {
  supplier: (dir) => [{ supplier: { name: dir } }],
  creator: (dir) => [{ creator: { fullname: dir } }],
  // Sin fecha de pago (null) al final en cualquiera de los dos sentidos
  paid_on: (dir) => [{ paid_on: { sort: dir, nulls: 'last' } }],
};

const DATE_RANGE_COLUMNS = ['planned_on', 'paid_on', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['supplier', 'status', 'creator'] as const;

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = {
  supplier: 'supplier_id',
  status: 'status',
  creator: 'created_by',
};

/** Columnas de importe con filtro de texto (coincidencia exacta del decimal). */
const AMOUNT_COLUMNS = ['invoices_total', 'credits_total', 'advance_total', 'withholdings_total', 'net_total'] as const;

/** Filtros que no pasan por `buildFiltersWhere` (se resuelven a mano). */
const OWN_FILTERS = ['number', 'methods', ...AMOUNT_COLUMNS] as const;

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...OWN_FILTERS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  supplier: isUuid,
  creator: isUuid,
  status: (v) => v in PAYMENT_ORDER_STATUS_LABELS,
  methods: (v) => v === NULL_FILTER_VALUE || v in PAYMENT_METHOD_LABELS,
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams): FilterState {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
const resolveCompanyId = () => companyIdIfCanView('pagos');

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

  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...OWN_FILTERS] }) as OrderWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as OrderWhere);

  // Texto: numero (parcial) e importes (exactos)
  const numberText = f.number?.[0]?.trim();
  if (numberText) and.push({ number: contains(numberText) });

  for (const column of AMOUNT_COLUMNS) {
    const text = f[column]?.[0]?.trim();
    if (!text) continue;
    const amount = parseAmountFilter(text);
    and.push(amount ? { [column]: amount } : { id: { in: [] } });
  }

  // Medios de pago (M:M): NULL_FILTER_VALUE = sin pagos cargados ("Sin pagar")
  const methodValues = f.methods ?? [];
  if (methodValues.length > 0) {
    const wantsNone = methodValues.includes(NULL_FILTER_VALUE);
    // Solo valores del enum: un texto cualquiera de la URL no puede llegar a Prisma
    const allowed: readonly string[] = Object.values(payment_method);
    const methods = methodValues.filter((v): v is payment_method => allowed.includes(v));
    const conditions: OrderWhere[] = [];
    if (methods.length) conditions.push({ payments: { some: { method: { in: methods } } } });
    if (wantsNone) conditions.push({ payments: { none: {} } });
    and.push(conditions.length === 1 ? conditions[0] : { OR: conditions });
  }

  return { AND: and };
}

const ORDER_SELECT = {
  id: true,
  number: true,
  planned_on: true,
  paid_on: true,
  status: true,
  invoices_total: true,
  credits_total: true,
  advance_total: true,
  withholdings_total: true,
  net_total: true,
  created_at: true,
  supplier: { select: { id: true, name: true, cuit: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  payments: { select: { method: true } },
} as const;

function shape(rows: Prisma.payment_ordersGetPayload<{ select: typeof ORDER_SELECT }>[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    planned_on: r.planned_on,
    paid_on: r.paid_on,
    status: r.status,
    invoices_total: r.invoices_total.toString(),
    credits_total: r.credits_total.toString(),
    advance_total: r.advance_total.toString(),
    withholdings_total: r.withholdings_total.toString(),
    net_total: r.net_total.toString(),
    created_at: r.created_at,
    supplier: { id: r.supplier.id, name: r.supplier.name, cuit: formatCuit(r.supplier.cuit) },
    creator: { id: r.creator.id, name: profileDisplayName(r.creator) },
    methods: [...new Set(r.payments.map((p) => p.method))],
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPaymentOrdersPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const orderBy: OrderOrderBy[] = [
      ...resolveSorts<OrderOrderBy>(state.sorting, VALID_SORT_FIELDS, SORT_MAP),
      { planned_on: 'desc' },
      { created_at: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.payment_orders.findMany({ where, orderBy, skip, take, select: ORDER_SELECT }),
      prisma.payment_orders.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener ordenes de pago', { data: { error } });
    throw new Error('No se pudo obtener la lista de ordenes de pago');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllPaymentOrdersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PaymentOrderListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: OrderOrderBy[] = [{ planned_on: 'desc' }, { created_at: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: PAYMENT_ORDERS_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.payment_orders.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.payment_orders.findMany({ where: { id: { in: ids }, company_id: companyId }, select: ORDER_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} órdenes de pago con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar ordenes de pago', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de órdenes de pago. Intente nuevamente.');
  }
}

// ============================================================================
// BANDA DE ATENCION
// ============================================================================

/**
 * Órdenes de pago que esperan una decisión: por aprobar (`pagos:approve`) y por pagar (`pagos:update`). Usan los
 * mismos contadores que las listas filtradas por estado (Pendiente de aprobación / Aprobada). Nunca rechaza:
 * `null` si no se pudo contar; cada número es `null` cuando el usuario no tiene el permiso de actuar.
 */
export async function getPaymentOrdersAttention(): Promise<{ toApprove: number | null; toPay: number | null } | null> {
  try {
    if (!(await checkPermissionServer('compras', 'pagos', 'view'))) return null;
    const [toApprove, toPay] = await Promise.all([getPaymentOrdersToApproveCount(), getPaymentOrdersToPayCount()]);
    return { toApprove, toPay };
  } catch (error) {
    logger.error('Error al contar ordenes de pago pendientes', { data: { error } });
    return null;
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPaymentOrderSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): OrderWhere {
    return buildWhereClause(companyId as string, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.payment_orders.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.payment_orders.groupBy({ by: ['supplier_id'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: await supplierFacetOptions(rows.map((r) => r.supplier_id)),
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.payment_orders.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'methods') {
      // M:M: cuantas ordenes (distintas) usan cada medio; sin pagos = "Sin pagar"
      const orders = await prisma.payment_orders.findMany({
        where,
        select: { payments: { select: { method: true } } },
      });
      const counts = new Map<string, number>();
      for (const order of orders) {
        const methods = new Set(order.payments.map((p) => p.method));
        for (const m of methods) counts.set(m, (counts.get(m) ?? 0) + 1);
        if (methods.size === 0) counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
      }
      return { counts };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de ordenes de pago', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type PaymentOrderListItem = Awaited<ReturnType<typeof getPaymentOrdersPaginated>>['data'][number];
