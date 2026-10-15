'use server';

import { checkPermissionServer } from '@/features/Permissions';
import {
  openCheckDebtsOfSupplier,
  rejectedCheckLabel,
  rejectedOwnCheckLabel,
} from '@/features/Treasury/lib/rejected-checks';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { isCreditNoteCbte, supplierInvoiceLabel } from '../lib/invoices';
import { canEditOrders, isoDay } from '../lib/payment-action-helpers';
import { openAdvancesOfSupplier, openInvoicesOfSupplier } from '../lib/payment-balances';
import { canApplyPaymentOrderAction, type PaymentOrderStatus } from '../lib/payment-order-state-machine';
import { cents, money } from '../lib/payment-totals';
import { supplierRecipients } from '../lib/supplier-send';
import { type PaymentOrderFormValues } from '../schemas/payment-orders';

/**
 * Datos del formulario: el proveedor (con su saldo pendiente), sus comprobantes a pagar con
 * pendiente, sus anticipos disponibles y sus OC (para un anticipo). Sin proveedor, nada.
 */
export async function getPaymentOrderFormData(supplierId?: string, options: { excludeOrderId?: string } = {}) {
  if (!(await canEditOrders())) return null;
  const companyId = await getActiveCompanyId();
  const empty = { supplier: null, openItems: { invoices: [], advances: [], checkDebts: [] }, purchaseOrders: [] };
  if (!supplierId || !UUID_RE.test(supplierId)) return empty;
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, company_id: companyId },
    select: { id: true, name: true, cuit: true, vat_condition_id: true, is_active: true },
  });
  if (!supplier) return empty;
  const exclude = options.excludeOrderId && UUID_RE.test(options.excludeOrderId) ? options.excludeOrderId : undefined;
  const included = exclude
    ? (
        await prisma.payment_order_lines.findMany({
          where: { payment_order_id: exclude, kind: 'REJECTED_CHECK' },
          select: { third_party_check_id: true, own_check_id: true },
        })
      ).flatMap((l) =>
        l.third_party_check_id ?? l.own_check_id ? [(l.third_party_check_id ?? l.own_check_id) as string] : []
      )
    : [];
  const [invoices, advances, purchaseOrders, checkDebts] = await Promise.all([
    openInvoicesOfSupplier(prisma, companyId, supplier.id, { excludeOrderId: exclude }),
    openAdvancesOfSupplier(prisma, companyId, supplier.id, { excludeOrderId: exclude }),
    prisma.purchase_orders.findMany({
      where: {
        company_id: companyId,
        supplier_id: supplier.id,
        status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] },
      },
      select: { id: true, number: true, total: true },
      orderBy: { number: 'desc' },
      take: 100,
    }),
    openCheckDebtsOfSupplier(prisma, companyId, supplier.id, { excludeOrderId: exclude, include: included }),
  ]);
  return {
    supplier: { ...supplier, cuit: supplier.cuit.toString() },
    openItems: {
      invoices: invoices.map((i) => ({
        id: i.id,
        label: supplierInvoiceLabel({ cbte_type: i.cbteType, sales_point: i.salesPoint, number: i.number }),
        isCredit: isCreditNoteCbte(i.cbteType),
        issueDate: isoDay(i.issueDate)!,
        dueDate: isoDay(i.dueDate),
        total: money(cents(i.total)),
        pending: money(cents(i.pending)),
      })),
      advances: advances.map((a) => ({
        lineId: a.lineId,
        orderNumber: a.orderNumber,
        paidOn: isoDay(a.paidOn),
        description: a.description,
        amount: money(cents(a.amount)),
        available: money(cents(a.available)),
      })),
      /** Deudas por cheques de terceros endosados a este proveedor y rechazados (Tesoreria etapa 3a). */
      checkDebts: checkDebts.map((d) => ({
        checkId: d.checkId,
        label: d.label,
        rejectedOn: d.rejectedOn,
        amount: d.amount,
        pending: d.pending,
      })),
    },
    purchaseOrders: purchaseOrders.map((o) => ({ id: o.id, number: o.number, total: o.total.toFixed(2) })),
  };
}

/** Cheques de terceros EN CARTERA para endosar al registrar el pago (Tesoreria etapa 3a), por fecha de pago. */
export async function getPortfolioChecksForPayment() {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.third_party_checks.findMany({
    where: { company_id: companyId, status: 'IN_PORTFOLIO', portfolio: { is_active: true } },
    select: {
      id: true,
      number: true,
      bank: true,
      drawer_name: true,
      amount: true,
      payment_date: true,
      portfolio: { select: { name: true } },
    },
    orderBy: [{ payment_date: 'asc' }, { number: 'asc' }],
    take: 500,
  });
  return rows.map((c) => ({
    id: c.id,
    number: c.number,
    bank: c.bank,
    drawerName: c.drawer_name,
    amount: c.amount.toFixed(2),
    paymentDate: isoDay(c.payment_date)!,
    portfolioName: c.portfolio.name,
  }));
}

const userName = (p: { fullname: string | null; email: string | null } | null) =>
  p ? p.fullname ?? p.email ?? 'Usuario' : null;

/** Detalle de la orden: lineas, retenciones con certificado, medios, historial y acciones. */
export async function getPaymentOrderDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [canView, canUpdate, canApprove] = await Promise.all([
    checkPermissionServer('compras', 'pagos', 'view'),
    checkPermissionServer('compras', 'pagos', 'update'),
    checkPermissionServer('compras', 'pagos', 'approve'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.payment_orders.findFirst({
    where: { id, company_id: companyId },
    include: {
      supplier: { select: { id: true, name: true, cuit: true } },
      creator: { select: { fullname: true, email: true } },
      approver: { select: { fullname: true, email: true } },
      payer: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      rejections: {
        select: { rejected_at: true, reason: true, rejecter: { select: { fullname: true, email: true } } },
        orderBy: { rejected_at: 'asc' },
      },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          kind: true,
          amount: true,
          description: true,
          invoice: {
            select: { id: true, cbte_type: true, sales_point: true, number: true, total: true, due_date: true },
          },
          purchase_order: { select: { id: true, number: true } },
          source_line: { select: { payment_order: { select: { id: true, number: true } } } },
          third_party_check: { select: { id: true, number: true, bank: true } },
          own_check: { select: { id: true, number: true, account: { select: { name: true, bank_name: true } } } },
        },
      },
      withholdings: {
        orderBy: { tax: 'asc' },
        select: {
          id: true,
          tax: true,
          base: true,
          rate: true,
          amount: true,
          detail: true,
          manual: true,
          certificate_number: true,
          cancelled_at: true,
          regime: { select: { code: true, description: true } },
        },
      },
      payments: {
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          check_number: true,
          check_bank: true,
          check_due_on: true,
          treasury_account: { select: { id: true, name: true } },
          movement: { select: { date: true, cancelled_at: true } },
          third_party_check: { select: { id: true, drawer_name: true } },
          own_check: { select: { id: true, status: true, debited_on: true } },
        },
      },
    },
  });
  if (!order) return null;
  const today = treasuryToday();
  const status = order.status as PaymentOrderStatus;
  const at = (d: Date | null) => d?.toISOString() ?? null;
  const recipients = await supplierRecipients(prisma, order.supplier_id);
  return {
    id: order.id,
    number: order.number,
    status,
    supplier: { ...order.supplier, cuit: order.supplier.cuit.toString() },
    plannedOn: isoDay(order.planned_on)!,
    paidOn: isoDay(order.paid_on),
    notes: order.notes,
    rejectionNotes: status === 'DRAFT' ? order.rejection_notes : null,
    cancelReason: order.cancel_reason,
    sentTo: order.sent_to,
    recipients,
    totals: {
      invoicesTotal: order.invoices_total.toFixed(2),
      creditsTotal: order.credits_total.toFixed(2),
      advanceTotal: order.advance_total.toFixed(2),
      withholdingsTotal: order.withholdings_total.toFixed(2),
      netTotal: order.net_total.toFixed(2),
    },
    lines: order.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      amount: l.amount.toFixed(2),
      description: l.description,
      invoice: l.invoice
        ? {
            id: l.invoice.id,
            label: supplierInvoiceLabel(l.invoice),
            total: l.invoice.total.toFixed(2),
            dueDate: isoDay(l.invoice.due_date),
          }
        : null,
      purchaseOrder: l.purchase_order,
      sourceOrder: l.source_line?.payment_order ?? null,
      rejectedCheck: l.third_party_check
        ? {
            id: l.third_party_check.id,
            own: false,
            label: rejectedCheckLabel(l.third_party_check.number, l.third_party_check.bank),
          }
        : l.own_check
          ? {
              id: l.own_check.id,
              own: true,
              label: rejectedOwnCheckLabel(
                l.own_check.number,
                (l.own_check.account.bank_name || l.own_check.account.name).toUpperCase()
              ),
            }
          : null,
    })),
    withholdings: order.withholdings.map((w) => ({
      id: w.id,
      tax: w.tax,
      regime: w.regime,
      base: w.base.toFixed(2),
      rate: w.rate.toString(),
      amount: w.amount.toFixed(2),
      detail: w.detail,
      manual: w.manual,
      certificateNumber: w.certificate_number,
      cancelled: w.cancelled_at !== null,
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount.toFixed(2),
      reference: p.reference,
      checkNumber: p.check_number,
      checkBank: p.check_bank,
      checkDueOn: isoDay(p.check_due_on),
      thirdPartyCheck: p.third_party_check
        ? { id: p.third_party_check.id, drawerName: p.third_party_check.drawer_name }
        : null,
      // Cheque propio (Tesoreria etapa 3b): su estado dice si ya se debito.
      ownCheck: p.own_check
        ? { id: p.own_check.id, status: p.own_check.status, debitedOn: isoDay(p.own_check.debited_on) }
        : null,
      account: p.treasury_account,
      // Movimiento de Tesoreria: fecha valor y si todavia esta "a debitar".
      movement: p.movement
        ? {
            date: isoDay(p.movement.date)!,
            cancelled: p.movement.cancelled_at !== null,
            toDebit: isoDay(p.movement.date)! > today,
          }
        : null,
    })),
    history: [
      { event: 'Creada', at: at(order.created_at), by: userName(order.creator), notes: null },
      ...order.rejections.map((r) => ({
        event: 'Rechazada',
        at: at(r.rejected_at),
        by: userName(r.rejecter),
        notes: r.reason,
      })),
      ...(order.submitted_at
        ? [{ event: 'Enviada a aprobación', at: at(order.submitted_at), by: null, notes: null }]
        : []),
      ...(order.approved_at
        ? [{ event: 'Aprobada', at: at(order.approved_at), by: userName(order.approver), notes: null }]
        : []),
      ...(order.paid_on
        ? [{ event: 'Pagada', at: isoDay(order.paid_on), by: userName(order.payer), notes: null }]
        : []),
      ...(order.sent_at
        ? [{ event: 'Enviada al proveedor', at: at(order.sent_at), by: null, notes: order.sent_to.join(', ') }]
        : []),
      ...(order.cancelled_at
        ? [{ event: 'Anulada', at: at(order.cancelled_at), by: userName(order.canceller), notes: order.cancel_reason }]
        : []),
    ],
    can: {
      edit: canUpdate && canApplyPaymentOrderAction(status, 'edit'),
      submit: canUpdate && canApplyPaymentOrderAction(status, 'submit'),
      approve: canApprove && canApplyPaymentOrderAction(status, 'approve'),
      backToDraft: canUpdate && canApplyPaymentOrderAction(status, 'backToDraft'),
      pay: canUpdate && canApplyPaymentOrderAction(status, 'pay'),
      send: canUpdate && canApplyPaymentOrderAction(status, 'send'),
      cancel: canUpdate && canApplyPaymentOrderAction(status, 'cancel'),
    },
  };
}

/** Valores del formulario para editar un borrador. */
export async function getPaymentOrderEditValues(id: string): Promise<PaymentOrderFormValues | null> {
  if (!UUID_RE.test(id)) return null;
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.payment_orders.findFirst({
    where: { id, company_id: companyId, status: 'DRAFT' },
    select: {
      supplier_id: true,
      planned_on: true,
      notes: true,
      lines: {
        orderBy: { position: 'asc' },
        select: {
          kind: true,
          amount: true,
          invoice_id: true,
          source_line_id: true,
          third_party_check_id: true,
          own_check_id: true,
          purchase_order_id: true,
          description: true,
        },
      },
      withholdings: { where: { manual: true }, select: { tax: true, amount: true, detail: true } },
    },
  });
  if (!order) return null;
  const advance = order.lines.find((l) => l.kind === 'ADVANCE');
  return {
    supplierId: order.supplier_id,
    plannedOn: isoDay(order.planned_on)!,
    notes: order.notes ?? '',
    lines: order.lines
      .filter((l) => l.kind !== 'ADVANCE')
      .map((l) => ({
        kind: l.kind as 'INVOICE' | 'CREDIT_NOTE' | 'ADVANCE_APPLIED' | 'REJECTED_CHECK',
        invoiceId: l.invoice_id ?? '',
        sourceLineId: l.source_line_id ?? '',
        checkId: l.third_party_check_id ?? l.own_check_id ?? '',
        amount: l.amount.toFixed(2),
      })),
    advance: {
      amount: advance ? advance.amount.toFixed(2) : '',
      purchaseOrderId: advance?.purchase_order_id ?? '',
      description: advance?.description ?? '',
    },
    manualWithholdings: order.withholdings.map((w) => ({
      tax: w.tax,
      amount: w.amount.toFixed(2),
      reason: w.detail.replace(/^Corregida a mano: /, '').replace(/ \(calculada: .*\)$/, ''),
    })),
  };
}
