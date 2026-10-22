import { isUuid } from '@/shared/lib/uuid';
import 'server-only';
import { DATE_RANGE_COLUMNS, OPEN_ORDER_STATUSES, todayDate } from './due-invoices';

import { parseAmountText, parseDay, textValue } from '@/features/Treasury/lib/filter-values';
import {
  rejectedCheckLabel,
  rejectedOwnCheckLabel,
  supplierCheckDebtSql,
  type CheckDebtSource,
} from '@/features/Treasury/lib/rejected-checks';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { Prisma } from '@/generated/prisma/client';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { formatCuitText } from '@/shared/utils/cuit-text';
import moment from 'moment';
import type { FilterState } from './due-invoices';

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
const debtLabel = (debt: DebtRow) =>
  debt.source === 'OWN' ? rejectedOwnCheckLabel(debt.number, debt.bank) : rejectedCheckLabel(debt.number, debt.bank);

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
    for (const l of lines)
      if ((l.third_party_check_id ?? l.own_check_id) === r.id) orders.set(l.payment_order.id, l.payment_order);
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

export function shapeDebt(debt: OpenDebt) {
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
    supplier: { id: debt.supplier_id, name: debt.supplier_name, cuit: formatCuitText(debt.supplier_cuit) },
    orders: debt.orders,
  };
}
