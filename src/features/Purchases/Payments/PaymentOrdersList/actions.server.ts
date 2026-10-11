'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { pickFilters } from '@/features/Warehouses/lib/filters';
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
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

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

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('compras', 'pagos', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero. */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = text.trim().replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
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

  and.push(buildFiltersWhere(pickFilters(f, FACETED_COLUMNS), COLUMN_MAP) as OrderWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as OrderWhere);

  // Texto: numero (parcial) e importes (exactos)
  const numberText = f.number?.[0]?.trim();
  if (numberText) and.push({ number: contains(numberText) });

  for (const column of AMOUNT_COLUMNS) {
    const text = f[column]?.[0]?.trim();
    if (!text) continue;
    const amount = parseAmount(text);
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
  supplier: { select: { id: true, name: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  payments: { select: { method: true } },
} as const;

const profileName = (p: { fullname: string | null; email: string | null }) => p.fullname ?? p.email ?? '-';

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
    supplier: { id: r.supplier.id, name: r.supplier.name },
    creator: { id: r.creator.id, name: profileName(r.creator) },
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
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: OrderOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = SORT_MAP[s.id];
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (s.id === 'paid_on') resolvedSorts.push({ paid_on: { sort: dir, nulls: 'last' } });
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: OrderOrderBy[] = [...resolvedSorts, { planned_on: 'desc' }, { created_at: 'desc' }];

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

export async function getAllPaymentOrdersForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await prisma.payment_orders.findMany({
      where,
      orderBy: [{ planned_on: 'desc' }, { created_at: 'desc' }],
      select: ORDER_SELECT,
    });
    return shape(rows);
  } catch (error) {
    logger.error('Error al exportar ordenes de pago', { data: { error } });
    throw new Error('No se pudo exportar la lista de ordenes de pago');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPaymentOrderSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): OrderWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
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

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.payment_orders.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.payment_orders.groupBy({ by: ['supplier_id'], where, _count: true });
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
      const rows = await prisma.payment_orders.groupBy({ by: ['created_by'], where, _count: true });
      const ids = rows.map((r) => r.created_by);
      const profiles = ids.length
        ? await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullname: true, email: true },
            orderBy: { fullname: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: profiles.map((p) => ({ id: p.id, name: profileName(p) })),
      };
    }

    if (columnId === 'methods') {
      // M:M: cuantas ordenes (distintas) usan cada medio; sin pagos = "Sin pagar"
      const orders = await prisma.payment_orders.findMany({ where, select: { payments: { select: { method: true } } } });
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
