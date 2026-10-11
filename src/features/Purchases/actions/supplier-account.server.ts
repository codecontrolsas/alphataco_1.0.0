'use server';

import moment from 'moment';
import { checkPermissionServer } from '@/features/Permissions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { supplierInvoiceLabel } from '../lib/invoices';
import { openAdvancesOfSupplier, openInvoicesOfSupplier } from '../lib/payment-balances';
import { openCheckDebtsOfSupplier } from '@/features/Treasury/lib/rejected-checks';
import { cents, money } from '../lib/payment-totals';

/**
 * Cuenta corriente de un proveedor (spec Compras etapa 5 §4), derivada de los documentos:
 * - comprobantes a pagar (conformes o aprobados): facturas y ND suman, NC restan;
 * - ordenes de pago pagadas: restan lo pagado (neto + retenciones);
 * - cheques de terceros endosados al proveedor y rechazados (Tesoreria etapa 3a): suman (se le vuelve a deber).
 * Saldo > 0 = se le debe; < 0 = queda a favor (anticipos sin aplicar).
 */

const CREDIT_NOTES = [3, 8, 13];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getSupplierAccount(supplierId: string, range: { from?: string; to?: string } = {}) {
  if (!UUID_RE.test(supplierId)) return null;
  if (!(await checkPermissionServer('compras', 'pagos', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const supplier = await prisma.suppliers.findFirst({ where: { id: supplierId, company_id: companyId }, select: { id: true, name: true } });
  if (!supplier) return null;

  const [invoices, orders, openInvoices, advances, rejectedChecks] = await Promise.all([
    prisma.supplier_invoices.findMany({
      where: { company_id: companyId, supplier_id: supplierId, status: { in: ['CONFORMING', 'APPROVED'] } },
      select: { id: true, cbte_type: true, sales_point: true, number: true, issue_date: true, due_date: true, total: true },
    }),
    prisma.payment_orders.findMany({
      where: { company_id: companyId, supplier_id: supplierId, status: 'PAID' },
      select: { id: true, number: true, paid_on: true, net_total: true, withholdings_total: true, advance_total: true },
    }),
    openInvoicesOfSupplier(prisma, companyId, supplierId),
    openAdvancesOfSupplier(prisma, companyId, supplierId),
    openCheckDebtsOfSupplier(prisma, companyId, supplierId, { includeSettled: true }),
  ]);

  type Movement = {
    date: string;
    kind: 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'REJECTED_CHECK';
    id: string;
    label: string;
    dueDate: string | null;
    debit: string;
    credit: string;
    detail: string | null;
  };
  const all: Movement[] = [
    ...invoices.map((i): Movement => {
      const credit = CREDIT_NOTES.includes(i.cbte_type);
      return {
        date: i.issue_date.toISOString().slice(0, 10),
        kind: credit ? 'CREDIT_NOTE' : 'INVOICE',
        id: i.id,
        label: supplierInvoiceLabel(i),
        dueDate: i.due_date ? i.due_date.toISOString().slice(0, 10) : null,
        debit: credit ? '0.00' : i.total.toFixed(2),
        credit: credit ? i.total.toFixed(2) : '0.00',
        detail: null,
      };
    }),
    ...orders.map(
      (o): Movement => ({
        date: o.paid_on!.toISOString().slice(0, 10),
        kind: 'PAYMENT',
        id: o.id,
        label: o.number,
        dueDate: null,
        debit: '0.00',
        credit: money(cents(o.net_total.toFixed(2)) + cents(o.withholdings_total.toFixed(2))),
        detail: [
          `Neto ${o.net_total.toFixed(2)}`,
          Number(o.withholdings_total) > 0 ? `retenciones ${o.withholdings_total.toFixed(2)}` : null,
          Number(o.advance_total) > 0 ? `incluye anticipo ${o.advance_total.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })
    ),
    ...rejectedChecks.map(
      (c): Movement => ({
        date: c.rejectedOn,
        kind: 'REJECTED_CHECK',
        id: c.checkId,
        label: c.label,
        dueDate: null,
        debit: c.amount,
        credit: '0.00',
        detail: `Librador ${c.drawerName}`,
      })
    ),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'PAYMENT' ? 1 : 0) - (b.kind === 'PAYMENT' ? 1 : 0) || a.label.localeCompare(b.label));

  const from = range.from && DATE_RE.test(range.from) ? range.from : null;
  const to = range.to && DATE_RE.test(range.to) ? range.to : null;
  let running = BigInt(0);
  let previous = BigInt(0);
  const movements: (Movement & { balance: string })[] = [];
  for (const m of all) {
    running += cents(m.debit) - cents(m.credit);
    if (from && m.date < from) {
      previous = running;
      continue;
    }
    if (to && m.date > to) continue;
    movements.push({ ...m, balance: money(running) });
  }

  const today = moment().format('YYYY-MM-DD');
  const debts = openInvoices.filter((i) => ![3, 8, 13].includes(i.cbteType));
  const overdue = debts.filter((i) => i.dueDate && i.dueDate.toISOString().slice(0, 10) < today).reduce((acc, i) => acc + cents(i.pending), BigInt(0));
  const upcoming = debts.filter((i) => !i.dueDate || i.dueDate.toISOString().slice(0, 10) >= today).reduce((acc, i) => acc + cents(i.pending), BigInt(0));

  return {
    supplier,
    range: { from, to },
    previousBalance: from ? money(previous) : null,
    movements,
    summary: {
      balance: money(running),
      overdue: money(overdue),
      upcoming: money(upcoming),
      advancesAvailable: money(advances.reduce((acc, a) => acc + cents(a.available), BigInt(0))),
    },
  };
}

export type SupplierAccount = NonNullable<Awaited<ReturnType<typeof getSupplierAccount>>>;
