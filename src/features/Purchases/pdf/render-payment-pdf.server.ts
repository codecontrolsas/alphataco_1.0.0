import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { rejectedCheckLabel } from '@/features/Treasury/lib/rejected-checks';
import { supplierInvoiceLabel } from '../lib/invoices';
import { PurchaseError } from '../lib/purchase-errors';
import { trimDecimals } from '../lib/quantity-format';
import { PaymentOrderPdfDocument } from './PaymentPdfDocuments';
import { buildPaymentPdfData } from './payment-pdf-data';
import { COMPANY_SELECT, SUPPLIER_SELECT, companySource, loadCompanyLogo, loadReactPdf, supplierSource, type RenderedPdf } from './render-purchase-pdf.server';

/** PDF de la orden de pago con sus certificados de retencion (spec Compras etapa 5 §4). */
export async function renderPaymentOrderPdf(orderId: string, companyId: string): Promise<RenderedPdf> {
  const order = await prisma.payment_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: {
      number: true,
      status: true,
      planned_on: true,
      paid_on: true,
      notes: true,
      invoices_total: true,
      credits_total: true,
      advance_total: true,
      withholdings_total: true,
      net_total: true,
      company: { select: { ...COMPANY_SELECT, fiscal_profile: { select: { gross_income_number: true } } } },
      supplier: { select: SUPPLIER_SELECT },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          kind: true,
          amount: true,
          description: true,
          invoice: { select: { cbte_type: true, sales_point: true, number: true } },
          purchase_order: { select: { number: true } },
          source_line: { select: { payment_order: { select: { number: true } } } },
          third_party_check: { select: { number: true, bank: true } },
        },
      },
      withholdings: {
        orderBy: { tax: 'asc' },
        select: {
          tax: true,
          base: true,
          rate: true,
          amount: true,
          certificate_number: true,
          cancelled_at: true,
          regime: { select: { code: true, description: true } },
        },
      },
      payments: {
        select: {
          method: true,
          amount: true,
          reference: true,
          check_number: true,
          check_bank: true,
          check_due_on: true,
          treasury_account: { select: { name: true } },
          third_party_check: { select: { drawer_name: true } },
        },
      },
    },
  });
  if (!order) throw new PurchaseError('La orden de pago no existe');

  const data = buildPaymentPdfData({
    number: order.number,
    date: (order.paid_on ?? order.planned_on).toISOString().slice(0, 10),
    status: order.status,
    company: { ...companySource(order.company), grossIncomeNumber: order.company.fiscal_profile?.gross_income_number ?? null },
    supplier: supplierSource(order.supplier),
    lines: order.lines.map((l) => ({
      kind: l.kind,
      label: l.invoice
        ? supplierInvoiceLabel(l.invoice)
        : l.third_party_check
          ? rejectedCheckLabel(l.third_party_check.number, l.third_party_check.bank)
          : l.kind === 'ADVANCE'
          ? [l.description, l.purchase_order ? `OC ${l.purchase_order.number}` : null].filter(Boolean).join(' · ')
          : (l.source_line?.payment_order.number ?? ''),
      amount: l.amount.toFixed(2),
    })),
    withholdings: order.withholdings.map((w) => ({
      tax: w.tax,
      regimeCode: w.regime.code,
      regimeDescription: w.regime.description,
      base: w.base.toFixed(2),
      rate: trimDecimals(w.rate.toFixed(4)),
      amount: w.amount.toFixed(2),
      certificateNumber: w.certificate_number,
      cancelled: w.cancelled_at !== null,
    })),
    payments: order.payments.map((p) => ({
      method: p.method,
      account: p.treasury_account.name,
      amount: p.amount.toFixed(2),
      reference: p.reference,
      checkNumber: p.check_number,
      checkBank: p.check_bank,
      checkDueOn: p.check_due_on ? p.check_due_on.toISOString().slice(0, 10) : null,
      drawerName: p.third_party_check?.drawer_name ?? null,
    })),
    totals: {
      invoicesTotal: order.invoices_total.toFixed(2),
      creditsTotal: order.credits_total.toFixed(2),
      advanceTotal: order.advance_total.toFixed(2),
      withholdingsTotal: order.withholdings_total.toFixed(2),
      netTotal: order.net_total.toFixed(2),
    },
    notes: order.notes,
  });

  const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(order.company.company_logo)]);
  const buffer = await rp.renderToBuffer(PaymentOrderPdfDocument(rp, data, logo));
  return { filename: `${order.number}.pdf`, content: new Uint8Array(buffer) };
}
