import 'server-only';
import { companyIdIfCanView } from './list-access';

import { formatVoucherNumber } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { Prisma } from '@/generated/prisma/client';
import type { payment_order_status } from '@/generated/prisma/enums';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import { isOneOf, isUuidOrNull, parseValidatedListState } from '@/shared/lib/table-list-query';
import { isUuid } from '@/shared/lib/uuid';
import moment from 'moment';
import { DAYS_VALUES, DUE_CBTE_TYPE_IDS } from '../Payments/DueInvoicesList/constants';
import { supplierInvoiceLabel } from './invoices';
import { parseAmountFilter, voucherNumberWhere } from './list-filters';
import { formatCuit } from './supplier-ids';

export type InvoiceWhere = Prisma.supplier_invoicesWhereInput;
export type InvoiceOrderBy = Prisma.supplier_invoicesOrderByWithRelationInput;
export type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). `pending` y `days` se resuelven aparte. */
export const VALID_SORT_FIELDS = new Set(['cbte_type', 'issue_date', 'total']);

export const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => InvoiceOrderBy[]> = {
  number: (dir) => [{ sales_point: dir }, { number: dir }],
  supplier: (dir) => [{ supplier: { name: dir } }],
  // Mas dias = vence mas tarde: ordenar por dias equivale a ordenar por vencimiento (nulos al final).
  due_date: (dir) => [{ due_date: { sort: dir, nulls: 'last' } }],
  days: (dir) => [{ due_date: { sort: dir, nulls: 'last' } }],
};

export const DATE_RANGE_COLUMNS = ['issue_date', 'due_date'];

/** Filtros que no pasan por `buildFiltersWhere` (se resuelven a mano). */
const OWN_FILTERS = ['cbte_type', 'number', 'total', 'pending', 'days', 'orders'] as const;

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  'supplier',
  ...OWN_FILTERS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  supplier: isUuid,
  cbte_type: (v) => (DUE_CBTE_TYPE_IDS as readonly number[]).includes(Number(v)),
  days: isOneOf(DAYS_VALUES),
  orders: isUuidOrNull,
};

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = { supplier: 'supplier_id' };

/** Ordenes "en curso": no anuladas y no pagadas. */
export const OPEN_ORDER_STATUSES: payment_order_status[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];

export const DEFAULT_ORDER_BY: InvoiceOrderBy[] = [
  { due_date: { sort: 'asc', nulls: 'last' } },
  { issue_date: 'asc' },
  { number: 'asc' },
];

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
export function parseListState(searchParams: DataTableSearchParams): FilterState {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
export const resolveCompanyId = () => companyIdIfCanView('pagos');

/** "Hoy" como fecha (DATE, medianoche UTC) en horario de Argentina (UTC-3): el vencimiento es un dia, no un instante. */
export function todayDate(): Date {
  return new Date(`${treasuryToday()}T00:00:00.000Z`);
}

/**
 * WHERE compartido entre paginated, export y facets. El pendiente tiene UNA sola definicion
 */
export function buildWhereClause(companyId: string, state: FilterState, pendingMap: Map<string, string>): InvoiceWhere {
  const f = state.filters;
  let ids = [...pendingMap.keys()];

  // Pendiente (texto, exacto): se resuelve sobre el mapa, que es la unica fuente del pendiente.
  const pendingText = f.pending?.[0]?.trim();
  if (pendingText) {
    const amount = parseAmountFilter(pendingText);
    ids = amount ? ids.filter((id) => new Prisma.Decimal(pendingMap.get(id) ?? 0).equals(amount)) : [];
  }

  const and: InvoiceWhere[] = [{ company_id: companyId }, { id: { in: ids } }];

  const search = state.search?.trim();
  if (search) {
    const or: InvoiceWhere[] = [
      {
        supplier: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { trade_name: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    ];
    const byNumber = /^[\d-]+$/.test(search) ? voucherNumberWhere(search) : null;
    if (byNumber) or.push(byNumber);
    and.push({ OR: or });
  }

  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...OWN_FILTERS] }) as InvoiceWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as InvoiceWhere);

  // Texto: comprobante (exacto) y total (exacto, decimal)
  const numberText = f.number?.[0]?.trim();
  if (numberText) and.push(voucherNumberWhere(numberText) ?? { id: { in: [] } });

  const totalText = f.total?.[0]?.trim();
  if (totalText) {
    const amount = parseAmountFilter(totalText);
    and.push(amount ? { total: amount } : { id: { in: [] } });
  }

  // Tipo de comprobante (Int): conversion manual
  const cbteTypes = f.cbte_type?.map(Number).filter((n) => !Number.isNaN(n));
  if (cbteTypes?.length) and.push({ cbte_type: { in: cbteTypes } });

  // Dias (derivado de due_date vs hoy): overdue / upcoming / none
  const dayValues = f.days ?? [];
  if (dayValues.length > 0) {
    const today = todayDate();
    const conditions: InvoiceWhere[] = [];
    if (dayValues.includes('overdue')) conditions.push({ due_date: { lt: today } });
    if (dayValues.includes('upcoming')) conditions.push({ due_date: { gte: today } });
    if (dayValues.includes('none')) conditions.push({ due_date: null });
    and.push(conditions.length === 1 ? conditions[0] : { OR: conditions });
  }

  // Ordenes de pago en curso (M:M); NULL_FILTER_VALUE = sin orden
  const orderValues = f.orders ?? [];
  if (orderValues.length > 0) {
    const wantsNone = orderValues.includes(NULL_FILTER_VALUE);
    const orderIds = orderValues.filter((v) => v !== NULL_FILTER_VALUE);
    const open = { status: { in: OPEN_ORDER_STATUSES } };
    const conditions: InvoiceWhere[] = [];
    if (orderIds.length) {
      conditions.push({ payment_lines: { some: { payment_order: { id: { in: orderIds }, ...open } } } });
    }
    if (wantsNone) conditions.push({ payment_lines: { none: { payment_order: open } } });
    and.push(conditions.length === 1 ? conditions[0] : { OR: conditions });
  }

  return { AND: and };
}

export const INVOICE_SELECT = {
  id: true,
  cbte_type: true,
  sales_point: true,
  number: true,
  issue_date: true,
  due_date: true,
  total: true,
  supplier: { select: { id: true, name: true, cuit: true } },
  payment_lines: {
    where: { payment_order: { status: { in: OPEN_ORDER_STATUSES } } },
    select: { payment_order: { select: { id: true, number: true } } },
  },
} satisfies Prisma.supplier_invoicesSelect;

export function shape(
  rows: Prisma.supplier_invoicesGetPayload<{ select: typeof INVOICE_SELECT }>[],
  pendingMap: Map<string, string>
) {
  const today = moment.utc(todayDate());
  return rows.map((r) => {
    const orders = new Map<string, { id: string; number: string }>();
    for (const l of r.payment_lines) orders.set(l.payment_order.id, l.payment_order);

    return {
      id: r.id,
      kind: 'INVOICE' as 'INVOICE' | 'CHECK',
      label: supplierInvoiceLabel(r),
      voucher_number: formatVoucherNumber(r.sales_point, Number(r.number)),
      cbte_type: r.cbte_type as number | null,
      issue_date: r.issue_date,
      due_date: r.due_date as Date | null,
      /** Dias hasta el vencimiento (negativo = vencido); `null` si no tiene vencimiento. */
      days_to_due: (r.due_date ? moment.utc(r.due_date).diff(today, 'days') : null) as number | null,
      total: r.total.toString(),
      pending: pendingMap.get(r.id) ?? '0',
      supplier: { id: r.supplier.id, name: r.supplier.name, cuit: formatCuit(r.supplier.cuit) },
      orders: [...orders.values()].sort((a, b) => a.number.localeCompare(b.number)),
    };
  });
}
