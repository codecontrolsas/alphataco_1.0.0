import 'server-only';

import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { COMPANY_SELECT, companySource, loadCompanyLogo, loadReactPdf } from '@/shared/lib/pdf/react-pdf.server';
import type { RenderedPdf } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { rejectedCheckLabel } from '../lib/rejected-checks';
import { TreasuryError } from '../lib/treasury-errors';
import { ReceiptPdfDocument } from './ReceiptPdfDocument';
import { buildReceiptPdfData } from './receipt-pdf-data';
import { isoDay } from '../lib/dates';


/** PDF del recibo de cobranza, generado a demanda (spec Tesorería etapa 2 §3.5). */
export async function renderCustomerReceiptPdf(receiptId: string, companyId: string): Promise<RenderedPdf> {
  const receipt = await prisma.customer_receipts.findFirst({
    where: { id: receiptId, company_id: companyId },
    select: {
      number: true,
      status: true,
      date: true,
      notes: true,
      invoices_total: true,
      advance_total: true,
      advances_applied_total: true,
      withholdings_total: true,
      received_total: true,
      fx_difference_total: true,
      company: { select: COMPANY_SELECT },
      customer: { select: { name: true, cuit: true, vat_condition_id: true, fiscal_street: true, fiscal_city: true } },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          kind: true,
          currency: true,
          applied_amount: true,
          exchange_rate: true,
          amount_ars: true,
          fx_difference: true,
          description: true,
          invoice: { select: { cbte_type: true, number: true, sales_point: { select: { number: true } } } },
          source_line: { select: { receipt: { select: { number: true } } } },
          third_party_check: { select: { number: true, bank: true } },
        },
      },
      withholdings: {
        orderBy: { id: 'asc' },
        select: { tax: true, jurisdiction: true, certificate_number: true, certificate_date: true, amount: true },
      },
      payments: {
        orderBy: { id: 'asc' },
        select: {
          method: true,
          amount: true,
          reference: true,
          check_number: true,
          check_bank: true,
          check_due_on: true,
          drawer_name: true,
          treasury_account: { select: { name: true } },
        },
      },
    },
  });
  if (!receipt) throw new TreasuryError('El recibo no existe');

  const data = buildReceiptPdfData({
    number: receipt.number,
    date: isoDay(receipt.date),
    status: receipt.status,
    company: companySource(receipt.company),
    customer: {
      name: receipt.customer.name,
      cuit: receipt.customer.cuit.toString(),
      vatConditionId: receipt.customer.vat_condition_id,
      street: receipt.customer.fiscal_street,
      city: receipt.customer.fiscal_city,
    },
    lines: receipt.lines.map((l) => ({
      kind: l.kind,
      label: l.invoice
        ? formatVoucherLabel(l.invoice.cbte_type, l.invoice.sales_point.number, l.invoice.number)
        : l.third_party_check
          ? rejectedCheckLabel(l.third_party_check.number, l.third_party_check.bank)
          : l.kind === 'ADVANCE_APPLIED'
            ? l.source_line?.receipt.number ?? ''
            : l.description ?? '',
      currency: l.currency.trim(),
      applied: l.applied_amount.toFixed(2),
      rate: l.exchange_rate.toFixed(6),
      ars: l.amount_ars.toFixed(2),
      fxDifference: l.fx_difference.toFixed(2),
    })),
    withholdings: receipt.withholdings.map((w) => ({
      tax: w.tax,
      jurisdiction: w.jurisdiction,
      certificateNumber: w.certificate_number,
      certificateDate: isoDay(w.certificate_date),
      amount: w.amount.toFixed(2),
    })),
    payments: receipt.payments.map((p) => ({
      method: p.method,
      account: p.treasury_account.name,
      amount: p.amount.toFixed(2),
      reference: p.reference,
      checkNumber: p.check_number,
      checkBank: p.check_bank,
      checkDueOn: p.check_due_on ? isoDay(p.check_due_on) : null,
      drawerName: p.drawer_name,
    })),
    totals: {
      invoices: receipt.invoices_total.toFixed(2),
      advance: receipt.advance_total.toFixed(2),
      advancesApplied: receipt.advances_applied_total.toFixed(2),
      withholdings: receipt.withholdings_total.toFixed(2),
      received: receipt.received_total.toFixed(2),
      fxDifference: receipt.fx_difference_total.toFixed(2),
    },
    notes: receipt.notes,
  });

  const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(receipt.company.company_logo)]);
  const buffer = await rp.renderToBuffer(ReceiptPdfDocument(rp, data, logo));
  return { filename: `${receipt.number ?? 'recibo-borrador'}.pdf`, content: new Uint8Array(buffer) };
}
