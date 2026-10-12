import 'server-only';

import { timestampToLocalDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { COMPANY_SELECT, companySource, loadCompanyLogo, loadReactPdf } from '@/shared/lib/pdf/react-pdf.server';
import type { RenderedPdf } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { PurchaseError } from '../lib/purchase-errors';
import { PurchaseOrderPdfDocument, PurchaseQuotePdfDocument } from './PurchasePdfDocuments';
import { buildOrderPdfData, buildQuotePdfData, type PurchasePdfSource } from './purchase-pdf-data';

export const SUPPLIER_SELECT = {
  name: true,
  cuit: true,
  vat_condition_id: true,
  street: true,
  city: true,
  province: true,
} as const;

const REQUEST_LINE_SELECT = {
  description: true,
  material: { select: { code: true, name: true } },
  unit: { select: { abbreviation: true } },
} as const;

type SupplierRow = {
  name: string;
  cuit: bigint;
  vat_condition_id: number;
  street: string | null;
  city: string | null;
  province: string | null;
};

export function supplierSource(supplier: SupplierRow): PurchasePdfSource['supplier'] {
  return {
    name: supplier.name,
    cuit: supplier.cuit.toString(),
    vatConditionId: supplier.vat_condition_id,
    street: supplier.street,
    city: supplier.city,
    province: supplier.province,
  };
}

export async function renderPurchaseQuotePdf(quoteId: string, companyId: string): Promise<RenderedPdf> {
  const quote = await prisma.purchase_quotes.findFirst({
    where: { id: quoteId, company_id: companyId },
    select: {
      number: true,
      created_at: true,
      notes: true,
      company: { select: COMPANY_SELECT },
      supplier: { select: SUPPLIER_SELECT },
      lines: {
        select: {
          quantity: true,
          request_line: { select: { ...REQUEST_LINE_SELECT, position: true, request: { select: { number: true } } } },
        },
      },
    },
  });
  if (!quote) throw new PurchaseError('La cotización no existe');

  const lines = [...quote.lines].sort(
    (a, b) =>
      a.request_line.request.number.localeCompare(b.request_line.request.number) ||
      a.request_line.position - b.request_line.position
  );
  const data = buildQuotePdfData({
    number: quote.number,
    date: timestampToLocalDateOnly(quote.created_at),
    company: companySource(quote.company),
    supplier: supplierSource(quote.supplier),
    lines: lines.map((line) => ({
      code: line.request_line.material?.code ?? null,
      name: line.request_line.material?.name ?? null,
      description: line.request_line.description,
      quantity: line.quantity.toString(),
      unitAbbr: line.request_line.unit.abbreviation,
      unitPrice: null,
      vatRateId: null,
      netTotal: null,
      vatAmount: null,
    })),
    totals: null,
    deliveryDate: null,
    deliveryPlace: null,
    paymentTermDays: null,
    notes: quote.notes,
    status: null,
    approvedAt: null,
  });

  const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(quote.company.company_logo)]);
  const buffer = await rp.renderToBuffer(PurchaseQuotePdfDocument(rp, data, logo));
  return { filename: `${quote.number}.pdf`, content: new Uint8Array(buffer) };
}

export async function renderPurchaseOrderPdf(orderId: string, companyId: string): Promise<RenderedPdf> {
  const order = await prisma.purchase_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: {
      number: true,
      status: true,
      created_at: true,
      approved_at: true,
      delivery_date: true,
      delivery_place: true,
      payment_term_days: true,
      notes: true,
      subtotal: true,
      vat_total: true,
      total: true,
      company: { select: COMPANY_SELECT },
      supplier: { select: SUPPLIER_SELECT },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          quantity: true,
          unit_price: true,
          vat_rate_id: true,
          net_total: true,
          vat_amount: true,
          request_line: { select: REQUEST_LINE_SELECT },
        },
      },
    },
  });
  if (!order) throw new PurchaseError('La orden de compra no existe');

  const data = buildOrderPdfData({
    number: order.number,
    // La OC vale desde que se aprueba: esa es su fecha. Antes, la de alta.
    date: timestampToLocalDateOnly(order.approved_at ?? order.created_at),
    company: companySource(order.company),
    supplier: supplierSource(order.supplier),
    lines: order.lines.map((line) => ({
      code: line.request_line.material?.code ?? null,
      name: line.request_line.material?.name ?? null,
      description: line.request_line.description,
      quantity: line.quantity.toString(),
      unitAbbr: line.request_line.unit.abbreviation,
      unitPrice: line.unit_price.toString(),
      vatRateId: line.vat_rate_id,
      netTotal: line.net_total.toFixed(2),
      vatAmount: line.vat_amount.toFixed(2),
    })),
    totals: {
      subtotal: order.subtotal.toFixed(2),
      vatTotal: order.vat_total.toFixed(2),
      total: order.total.toFixed(2),
    },
    deliveryDate: toDateOnly(order.delivery_date),
    deliveryPlace: order.delivery_place,
    paymentTermDays: order.payment_term_days,
    notes: order.notes,
    status: order.status,
    approvedAt: order.approved_at?.toISOString() ?? null,
  });

  const [rp, logo] = await Promise.all([loadReactPdf(), loadCompanyLogo(order.company.company_logo)]);
  const buffer = await rp.renderToBuffer(PurchaseOrderPdfDocument(rp, data, logo));
  return { filename: `${order.number}.pdf`, content: new Uint8Array(buffer) };
}
