import 'server-only';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import type { payment_order_status } from '@/generated/prisma/enums';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { formatVoucherNumber } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { formatCuit } from './supplier-ids';
import { supplierInvoiceLabel } from './invoices';
import { isUuid, parseAmountText, parseDay, textValue } from '@/features/Treasury/lib/filter-values';
import {
  rejectedCheckLabel,
  rejectedOwnCheckLabel,
  supplierCheckDebtSql,
  type CheckDebtSource,
} from '@/features/Treasury/lib/rejected-checks';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { DAYS_VALUES, DUE_CBTE_TYPE_IDS, DUE_INVOICES_EXPORT_MAX_ROWS } from '../Payments/DueInvoicesList/constants';

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

const DATE_RANGE_COLUMNS = ['issue_date', 'due_date'];

/** Filtros que no pasan por `buildFiltersWhere` (se resuelven a mano). */
const OWN_FILTERS = ['cbte_type', 'number', 'total', 'pending', 'days', 'orders'] as const;

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  'supplier',
  ...OWN_FILTERS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  supplier: (v) => UUID_RE.test(v),
  cbte_type: (v) => (DUE_CBTE_TYPE_IDS as readonly number[]).includes(Number(v)),
  days: (v) => (DAYS_VALUES as readonly string[]).includes(v),
  orders: (v) => v === NULL_FILTER_VALUE || UUID_RE.test(v),
};

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = { supplier: 'supplier_id' };

/** Ordenes "en curso": no anuladas y no pagadas. */
const OPEN_ORDER_STATUSES: payment_order_status[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];

export const DEFAULT_ORDER_BY: InvoiceOrderBy[] = [
  { due_date: { sort: 'asc', nulls: 'last' } },
  { issue_date: 'asc' },
  { number: 'asc' },
];

export const exportTooLargeMessage = (maxRows: number) =>
  `Hay más de ${maxRows.toLocaleString('es-AR')} comprobantes con los filtros actuales. Acote la exportación con filtros.`;

const digitsOf = (value: string) => value.replace(/\D/g, '');

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
export function parseListState(searchParams: DataTableSearchParams): FilterState {
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

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
export async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('compras', 'pagos', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** "Hoy" como fecha (DATE, medianoche UTC) en horario de Argentina (UTC-3): el vencimiento es un dia, no un instante. */
export function todayDate(): Date {
  return new Date(`${treasuryToday()}T00:00:00.000Z`);
}

/** Numero de comprobante: "00003-00012345" (punto de venta + numero) o solo el numero. Coincidencia exacta. */
function voucherNumberWhere(text: string): InvoiceWhere | null {
  const parts = text.split('-').map(digitsOf).filter(Boolean);
  if (parts.length === 2) return { sales_point: Number(parts[0]), number: BigInt(parts[1]) };
  if (parts.length === 1) return { number: BigInt(parts[0]) };
  return null;
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero. */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = text.trim().replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
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
    const amount = parseAmount(pendingText);
    ids = amount ? ids.filter((id) => new Prisma.Decimal(pendingMap.get(id) ?? 0).equals(amount)) : [];
  }

  const and: InvoiceWhere[] = [{ company_id: companyId }, { id: { in: ids } }];

  const search = state.search?.trim();
  if (search) {
    const or: InvoiceWhere[] = [{ supplier: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { trade_name: { contains: search, mode: 'insensitive' } }] } }];
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
    const amount = parseAmount(totalText);
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

export function shape(rows: Prisma.supplier_invoicesGetPayload<{ select: typeof INVOICE_SELECT }>[], pendingMap: Map<string, string>) {
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


// ============================================================================
// DEUDAS POR CHEQUES RECHAZADOS (endosados): se suman como filas
// ============================================================================

type DebtRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_cuit: string;
  supplier_trade_name: string | null;
  number: string;
  bank: string;
  amount: string;
  rejected_on: string;
  pending: string;
  source: CheckDebtSource;
};

/** Etiqueta de la deuda según el cheque: de tercero endosado o propio (Tesorería etapa 3b). */
const debtLabel = (debt: DebtRow) => (debt.source === 'OWN' ? rejectedOwnCheckLabel(debt.number, debt.bank) : rejectedCheckLabel(debt.number, debt.bank));

export type OpenDebt = DebtRow & { orders: { id: string; number: string }[] };

/** Deudas con proveedores por cheques rechazados con pendiente > 0 (formula unica de `supplierCheckDebtSql`). */
export async function loadOpenCheckDebts(companyId: string): Promise<OpenDebt[]> {
  const rows = await prisma.$queryRaw<DebtRow[]>`
    SELECT d.id, d.supplier_id, s.name AS supplier_name, s.cuit::text AS supplier_cuit, s.trade_name AS supplier_trade_name, d.number, d.bank,
           d.amount, d.rejected_on, d.pending, d.source
    FROM (${supplierCheckDebtSql(Prisma.sql`c.company_id = ${companyId}::uuid`, null)}) d
    JOIN suppliers s ON s.id = d.supplier_id
    WHERE d.pending::numeric > 0`;
  if (rows.length === 0) return [];
  const lines = await prisma.payment_order_lines.findMany({
    where: {
      OR: [{ third_party_check_id: { in: rows.map((r) => r.id) } }, { own_check_id: { in: rows.map((r) => r.id) } }],
      payment_order: { status: { in: OPEN_ORDER_STATUSES } },
    },
    select: { third_party_check_id: true, own_check_id: true, payment_order: { select: { id: true, number: true } } },
  });
  return rows.map((r) => {
    const orders = new Map<string, { id: string; number: string }>();
    for (const l of lines) if ((l.third_party_check_id ?? l.own_check_id) === r.id) orders.set(l.payment_order.id, l.payment_order);
    return { ...r, orders: [...orders.values()].sort((a, b) => a.number.localeCompare(b.number)) };
  });
}

/** Aplica a una deuda los MISMOS filtros de la tabla (en memoria: son pocas). */
export function debtMatches(debt: OpenDebt, state: FilterState, today: string): boolean {
  const f = state.filters;

  const search = textValue(state.search)?.toLowerCase();
  if (search) {
    const hit =
      debt.supplier_name.toLowerCase().includes(search) ||
      (debt.supplier_trade_name ?? '').toLowerCase().includes(search) ||
      debt.number.toLowerCase().includes(search) ||
      debtLabel(debt).toLowerCase().includes(search);
    if (!hit) return false;
  }

  const supplierIds = (f.supplier ?? []).filter(isUuid);
  if (supplierIds.length && !supplierIds.includes(debt.supplier_id)) return false;

  // Un cheque no tiene tipo de comprobante: si se filtra por tipo, no entra
  if ((f.cbte_type ?? []).length > 0) return false;

  // Comprobante (exacto): el numero del cheque
  const numberText = textValue(f.number?.[0]);
  if (numberText) {
    const digits = numberText.replace(/\D/g, '');
    if (!digits || digits !== debt.number.replace(/\D/g, '')) return false;
  }

  const amountFilter = (value: string | undefined, actual: string): boolean => {
    const text = textValue(value);
    if (!text) return true;
    const normalized = parseAmountText(text);
    return normalized != null && new Prisma.Decimal(normalized).equals(new Prisma.Decimal(actual));
  };
  if (!amountFilter(f.total?.[0], debt.amount)) return false;
  if (!amountFilter(f.pending?.[0], debt.pending)) return false;

  // Fecha de emision y vencimiento = fecha del rechazo
  for (const column of DATE_RANGE_COLUMNS) {
    const from = parseDay(f[`${column}_from`]?.[0]);
    const to = parseDay(f[`${column}_to`]?.[0]);
    if (from && debt.rejected_on < from) return false;
    if (to && debt.rejected_on > to) return false;
  }

  const dayValues = f.days ?? [];
  if (dayValues.length > 0) {
    const state_ = debt.rejected_on < today ? 'overdue' : 'upcoming';
    if (!dayValues.includes(state_)) return false;
  }

  const orderValues = f.orders ?? [];
  if (orderValues.length > 0) {
    const wantsNone = orderValues.includes(NULL_FILTER_VALUE);
    const orderIds = orderValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hit = (wantsNone && debt.orders.length === 0) || debt.orders.some((o) => orderIds.includes(o.id));
    if (!hit) return false;
  }

  return true;
}

export const todayText = () => treasuryToday();

function shapeDebt(debt: OpenDebt) {
  const today = moment.utc(todayDate());
  const due = moment.utc(debt.rejected_on, 'YYYY-MM-DD', true);
  return {
    id: debt.id,
    kind: 'CHECK' as 'INVOICE' | 'CHECK',
    label: debtLabel(debt),
    voucher_number: debtLabel(debt),
    cbte_type: null as number | null,
    issue_date: due.toDate(),
    due_date: due.toDate() as Date | null,
    days_to_due: due.diff(today, 'days') as number | null,
    total: debt.amount,
    pending: debt.pending,
    supplier: { id: debt.supplier_id, name: debt.supplier_name, cuit: formatCuit(debt.supplier_cuit) },
    orders: debt.orders,
  };
}

type LightRow = {
  kind: 'INVOICE' | 'CHECK';
  id: string;
  supplier: string;
  salesPoint: number;
  number: bigint;
  cbteType: number | null;
  issue: number;
  due: number | null;
  total: Prisma.Decimal;
  pending: Prisma.Decimal;
};

const nullsLast = (a: number | null, b: number | null, dir: number) =>
  a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : dir * (a - b);

/** Comparador por columna (en memoria), para ordenar facturas y deudas de cheques en una sola lista. */
const LIGHT_COMPARATORS: Record<string, (a: LightRow, b: LightRow, dir: number) => number> = {
  supplier: (a, b, dir) => dir * a.supplier.localeCompare(b.supplier),
  number: (a, b, dir) => dir * (a.salesPoint - b.salesPoint || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0)),
  cbte_type: (a, b, dir) => nullsLast(a.cbteType, b.cbteType, dir),
  issue_date: (a, b, dir) => dir * (a.issue - b.issue),
  due_date: (a, b, dir) => nullsLast(a.due, b.due, dir),
  days: (a, b, dir) => nullsLast(a.due, b.due, dir),
  total: (a, b, dir) => dir * a.total.comparedTo(b.total),
  pending: (a, b, dir) => dir * a.pending.comparedTo(b.pending),
};

function compareLight(state: FilterState) {
  const sorts = state.sorting.flatMap((s) => {
    const cmp = Object.hasOwn(LIGHT_COMPARATORS, s.id) ? LIGHT_COMPARATORS[s.id] : undefined;
    return cmp ? [{ cmp, dir: s.desc ? -1 : 1 }] : [];
  });
  return (a: LightRow, b: LightRow) => {
    for (const { cmp, dir } of sorts) {
      const r = cmp(a, b, dir);
      if (r !== 0) return r;
    }
    // Orden por defecto: vencimiento, emision y numero
    return nullsLast(a.due, b.due, 1) || a.issue - b.issue || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0) || a.id.localeCompare(b.id);
  };
}

/**
 * Lista unificada (facturas + deudas por cheques rechazados): solo se usa cuando hay deudas que
 * pasan los filtros. Ordena TODO el conjunto filtrado en memoria y pagina por ids (igual que el
 * orden por pendiente), asi el orden vale para todas las paginas.
 */
export async function listUnified(
  where: InvoiceWhere,
  state: FilterState,
  pendingMap: Map<string, string>,
  debts: OpenDebt[],
  page: { skip: number; take: number } | null,
  companyId: string
) {
  const invoices = await prisma.supplier_invoices.findMany({
    where,
    select: { id: true, cbte_type: true, sales_point: true, number: true, issue_date: true, due_date: true, total: true, supplier: { select: { name: true } } },
  });
  const light: LightRow[] = [
    ...invoices.map((i): LightRow => ({
      kind: 'INVOICE',
      id: i.id,
      supplier: i.supplier.name,
      salesPoint: i.sales_point,
      number: i.number,
      cbteType: i.cbte_type,
      issue: i.issue_date.getTime(),
      due: i.due_date ? i.due_date.getTime() : null,
      total: new Prisma.Decimal(i.total),
      pending: new Prisma.Decimal(pendingMap.get(i.id) ?? 0),
    })),
    ...debts.map((d): LightRow => {
      const due = moment.utc(d.rejected_on, 'YYYY-MM-DD', true).valueOf();
      return {
        kind: 'CHECK',
        id: d.id,
        supplier: d.supplier_name,
        salesPoint: -1,
        number: BigInt(0),
        cbteType: null,
        issue: due,
        due,
        total: new Prisma.Decimal(d.amount),
        pending: new Prisma.Decimal(d.pending),
      };
    }),
  ].sort(compareLight(state));

  // Export (sin pagina): el conjunto completo tiene tope y las facturas se traen por tandas
  if (!page && light.length > DUE_INVOICES_EXPORT_MAX_ROWS) throw new ExportTooLargeError(exportTooLargeMessage(DUE_INVOICES_EXPORT_MAX_ROWS));

  const slice = page ? light.slice(page.skip, page.skip + page.take) : light;
  const invoiceIds = slice.filter((r) => r.kind === 'INVOICE').map((r) => r.id);
  const rows = !invoiceIds.length
    ? []
    : page
      ? await prisma.supplier_invoices.findMany({ where: { id: { in: invoiceIds } }, select: INVOICE_SELECT })
      : await fetchExportRowsInBatches({
          maxRows: DUE_INVOICES_EXPORT_MAX_ROWS,
          listIds: async (take) => invoiceIds.slice(0, take).map((id) => ({ id })),
          fetchByIds: (ids) => prisma.supplier_invoices.findMany({ where: { id: { in: ids }, company_id: companyId }, select: INVOICE_SELECT }),
          tooLargeMessage: exportTooLargeMessage,
        });
  const shapedInvoices = new Map(shape(rows, pendingMap).map((r) => [r.id, r]));
  const debtsById = new Map(debts.map((d) => [d.id, d]));

  const data = slice.flatMap((r) => {
    if (r.kind === 'INVOICE') {
      const item = shapedInvoices.get(r.id);
      return item ? [item] : [];
    }
    const debt = debtsById.get(r.id);
    return debt ? [shapeDebt(debt)] : [];
  });
  return { data, total: light.length };
}
