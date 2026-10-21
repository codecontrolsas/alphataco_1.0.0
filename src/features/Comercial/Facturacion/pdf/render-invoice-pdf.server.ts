import 'server-only';
import { Logger } from '@/lib/logger';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { storageUpload } from '@/shared/lib/storage';
import { loadInvoice } from '../lib/invoice-context.server';
import { formatVoucherLabel } from '../lib/invoice-type';
import { parseIssuerSnapshot, parseReceiverSnapshot } from '../lib/snapshots';
import { InvoicePdfDocument, type ReactPdf } from './InvoicePdfDocument';
import { buildInvoicePdfData, INVOICE_PDF_BUCKET } from './invoice-pdf-data';

const logger = new Logger('features/Comercial/Facturacion/pdf');

/**
 * react-pdf se importa en runtime, fuera del bundle: el React con el que Next empaqueta el código
 * de servidor (`react-server`) no expone los internos que necesita su reconciler y falla con
 * "Cannot read properties of undefined (reading 'S')". Node lo resuelve desde node_modules con el
 * React normal.
 */
function loadReactPdf(): Promise<ReactPdf> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@react-pdf/renderer');
}

export function invoicePdfPath(companyId: string, invoiceId: string): string {
  return `${companyId}/${invoiceId}.pdf`;
}

/**
 * Genera el PDF de un comprobante AUTORIZADO con los snapshots congelados al emitir y lo guarda
 * en RustFS. Idempotente: se puede volver a correr (por ejemplo si falló después del CAE).
 */
export async function renderAndStoreInvoicePdf(invoiceId: string, companyId: string): Promise<{ path: string } | { error: string }> {
  const invoice = await loadInvoice(invoiceId, companyId);
  if (!invoice) return { error: 'Comprobante no encontrado' };
  if (invoice.status !== 'autorizada' || !invoice.cae || !invoice.cae_due_date || invoice.number === null) {
    return { error: 'Solo se genera el PDF de un comprobante autorizado' };
  }
  const issuer = parseIssuerSnapshot(invoice.issuer_snapshot);
  const receiver = parseReceiverSnapshot(invoice.receiver_snapshot);
  if (!issuer || !receiver) return { error: 'Faltan los datos congelados al emitir' };

  const data = buildInvoicePdfData({
    cbteType: invoice.cbte_type,
    salesPoint: invoice.sales_point.number,
    number: invoice.number,
    issueDate: toDateOnly(invoice.issue_date)!,
    concept: invoice.concept,
    serviceFrom: toDateOnly(invoice.service_from),
    serviceTo: toDateOnly(invoice.service_to),
    paymentDueDate: toDateOnly(invoice.payment_due_date),
    currency: invoice.currency,
    arcaCurrencyId: invoice.arca_currency_id,
    exchangeRate: invoice.exchange_rate.toString(),
    netTaxed: invoice.net_taxed.toFixed(2),
    vatTotal: invoice.vat_total.toFixed(2),
    otherTaxes: invoice.other_taxes.toFixed(2),
    total: invoice.total.toFixed(2),
    vatBreakdown: invoice.vat_breakdown.map((v) => ({ vatRateId: v.vat_rate_id, base: v.base_amount.toFixed(2), amount: v.vat_amount.toFixed(2) })),
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unit_price.toString(),
      netAmount: l.net_amount.toFixed(2),
      vatRateId: l.vat_rate_id,
    })),
    issuer,
    receiver,
    receiverDocType: invoice.receiver_doc_type,
    receiverDocNumber: invoice.receiver_doc_number.toString(),
    associated: invoice.associated_invoice
      ? {
          label: formatVoucherLabel(invoice.associated_invoice.cbte_type, invoice.associated_invoice.sales_point.number, invoice.associated_invoice.number),
          issueDate: toDateOnly(invoice.associated_invoice.issue_date)!,
        }
      : null,
    notes: invoice.notes,
    cae: invoice.cae,
    caeDueDate: toDateOnly(invoice.cae_due_date)!,
    environment: invoice.environment,
    simulated: invoice.simulated,
  });

  try {
    const rp = await loadReactPdf();
    const buffer = await rp.renderToBuffer(InvoicePdfDocument(rp, data));
    const path = invoicePdfPath(companyId, invoiceId);
    const uploaded = await storageUpload(INVOICE_PDF_BUCKET, path, new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), {
      upsert: true,
    });
    if (!uploaded.ok) return { error: `No se pudo guardar el PDF: ${uploaded.error}` };
    await prisma.$executeRaw`UPDATE invoices SET pdf_path = ${path}, pdf_generated_at = NOW() WHERE id = ${invoiceId}::uuid`;
    logger.info('PDF de comprobante generado', { data: { invoiceId, path } });
    return { path };
  } catch (error) {
    logger.error('Error al generar el PDF del comprobante', { data: { error, invoiceId } });
    return { error: 'No se pudo generar el PDF' };
  }
}
