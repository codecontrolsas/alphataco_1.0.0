import {
  RECEIVER_VAT_CONDITIONS,
  VAT_RATE_LABELS,
  isReceiverVatConditionId,
  isVatRateId,
} from '@/shared/lib/arca/catalogs';
import { joinAddress, pdfDateText, unitAmountText } from '@/shared/lib/pdf/pdf-text';
import type { PdfCompanySource } from '@/shared/lib/pdf/types';
import { formatAmountText } from '@/shared/utils/amount-text';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { purchaseOrderWatermark, type PurchaseOrderStatus } from '../lib/order-state-machine';
import { formatQuantityWithUnit } from '../lib/quantity-format';

/**
 * View-model de los PDF de Compras (pedido de cotizacion y orden de compra). Puro, sin Prisma ni
 * directiva: recibe los datos ya leidos y devuelve todo como texto formateado, asi el layout no
 * calcula nada (mismo criterio que `invoice-pdf-data.ts`).
 */

export type PurchasePdfSource = {
  number: string;
  /** Fecha del documento, `YYYY-MM-DD`. */
  date: string;
  company: PdfCompanySource;
  supplier: {
    name: string;
    cuit: string;
    vatConditionId: number;
    street: string | null;
    city: string | null;
    province: string | null;
  };
  lines: {
    code: string | null;
    name: string | null;
    description: string | null;
    quantity: string;
    unitAbbr: string | null;
    unitPrice: string | null;
    vatRateId: number | null;
    netTotal: string | null;
    vatAmount: string | null;
  }[];
  totals: { subtotal: string; vatTotal: string; total: string } | null;
  deliveryDate: string | null;
  deliveryPlace: string | null;
  paymentTermDays: number | null;
  notes: string | null;
  status: PurchaseOrderStatus | null;
  approvedAt: string | null;
};

const money = (value: string) => `$ ${formatAmountText(value)}`;

/** Unitario: 2 decimales, o 4 si los tiene (los precios se guardan a 4). */
const unitPriceText = (value: string) => `$ ${unitAmountText(value)}`;

function itemText(line: PurchasePdfSource['lines'][number]): string {
  if (line.name) return line.code ? `[${line.code}] ${line.name}` : line.name;
  return line.description ?? '';
}

function header(src: PurchasePdfSource) {
  return {
    number: src.number,
    date: pdfDateText(src.date),
    company: {
      name: src.company.name,
      cuit: formatCuitText(src.company.cuit),
      address: joinAddress([src.company.address, src.company.city, src.company.province]),
    },
    supplier: {
      name: src.supplier.name,
      cuit: formatCuitText(src.supplier.cuit),
      vatCondition: isReceiverVatConditionId(src.supplier.vatConditionId)
        ? RECEIVER_VAT_CONDITIONS[src.supplier.vatConditionId].label
        : '',
      address: joinAddress([src.supplier.street, src.supplier.city, src.supplier.province]),
    },
    notes: src.notes?.trim() || null,
  };
}

export function buildQuotePdfData(src: PurchasePdfSource) {
  return {
    ...header(src),
    title: 'PEDIDO DE COTIZACIÓN',
    watermark: null,
    intro: 'Solicitamos cotización por los siguientes ítems:',
    request:
      'Por favor indique precio unitario neto e IVA de cada ítem, plazo de entrega, validez de la oferta y condición de pago.',
    lines: src.lines.map((line, index) => ({
      position: String(index + 1),
      item: itemText(line),
      quantity: formatQuantityWithUnit(line.quantity, line.unitAbbr),
    })),
  };
}

export function buildOrderPdfData(src: PurchasePdfSource) {
  const conditions: { label: string; value: string }[] = [];
  if (src.deliveryDate) conditions.push({ label: 'Fecha de entrega', value: pdfDateText(src.deliveryDate) });
  if (src.deliveryPlace?.trim()) conditions.push({ label: 'Lugar de entrega', value: src.deliveryPlace.trim() });
  if (src.paymentTermDays !== null) {
    conditions.push({
      label: 'Plazo de pago',
      value: src.paymentTermDays === 0 ? 'Contado' : `${src.paymentTermDays} días`,
    });
  }

  return {
    ...header(src),
    title: 'ORDEN DE COMPRA',
    watermark: src.status ? purchaseOrderWatermark({ status: src.status, approvedAt: src.approvedAt }) : null,
    lines: src.lines.map((line, index) => ({
      position: String(index + 1),
      item: itemText(line),
      quantity: formatQuantityWithUnit(line.quantity, line.unitAbbr),
      unitPrice: line.unitPrice ? unitPriceText(line.unitPrice) : '',
      vatRate: line.vatRateId !== null && isVatRateId(line.vatRateId) ? VAT_RATE_LABELS[line.vatRateId] : '',
      netTotal: line.netTotal ? money(line.netTotal) : '',
    })),
    totals: src.totals
      ? { subtotal: money(src.totals.subtotal), vatTotal: money(src.totals.vatTotal), total: money(src.totals.total) }
      : { subtotal: money('0'), vatTotal: money('0'), total: money('0') },
    conditions,
  };
}

export type QuotePdfData = ReturnType<typeof buildQuotePdfData>;
export type OrderPdfData = ReturnType<typeof buildOrderPdfData>;
