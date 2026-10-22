import { PAYMENT_METHOD_LABELS } from '@/features/Purchases/schemas/payment-orders';
import { RECEIVER_VAT_CONDITIONS, isReceiverVatConditionId } from '@/shared/lib/arca/catalogs';
import { pdfDateText, pdfPaymentDetail } from '@/shared/lib/pdf/pdf-text';
import { formatAmountText } from '@/shared/utils/amount-text';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../schemas/receipts';

/**
 * View-model del PDF del recibo de cobranza (spec Tesorería etapa 2 §3.5). Puro: recibe los datos
 * ya leídos y devuelve texto formateado. Mismo criterio que el PDF de la orden de pago de Compras.
 */

export type ReceiptPdfSource = {
  number: string | null;
  /** Fecha del cobro, `YYYY-MM-DD`. */
  date: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  company: { name: string; cuit: string; address: string | null; city: string | null; province: string | null };
  customer: { name: string; cuit: string; vatConditionId: number | null; street: string | null; city: string | null };
  lines: {
    kind: 'INVOICE' | 'ADVANCE' | 'ADVANCE_APPLIED' | 'REJECTED_CHECK';
    /** Comprobante (INVOICE), recibo de origen (ADVANCE_APPLIED) o descripción (ADVANCE). */
    label: string;
    currency: string;
    applied: string;
    rate: string;
    ars: string;
    fxDifference: string;
  }[];
  withholdings: {
    tax: keyof typeof CUSTOMER_WITHHOLDING_TAX_LABELS;
    jurisdiction: string | null;
    certificateNumber: string;
    certificateDate: string;
    amount: string;
  }[];
  payments: {
    method: keyof typeof PAYMENT_METHOD_LABELS;
    account: string;
    amount: string;
    reference: string | null;
    checkNumber: string | null;
    checkBank: string | null;
    checkDueOn: string | null;
    /** Librador del cheque (etapa 3a). */
    drawerName?: string | null;
  }[];
  totals: {
    invoices: string;
    advance: string;
    advancesApplied: string;
    withholdings: string;
    received: string;
    fxDifference: string;
  };
  notes: string | null;
};

const money = (value: string) =>
  value.startsWith('-') ? `-$ ${formatAmountText(value.slice(1))}` : `$ ${formatAmountText(value)}`;
const join = (parts: (string | null)[], separator = ', ') =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(separator) || null;
/** Cotización sin ceros de más ("1250.000000" → "1.250,00"; "1432.123456" → "1.432,123456"). */
const rateText = (value: string) => {
  const [int = '0', dec = ''] = value.split('.');
  const trimmed = dec.replace(/0+$/, '');
  return formatAmountText(`${int}.${trimmed.padEnd(2, '0')}`, Math.max(2, trimmed.length));
};
const isZero = (value: string) => /^-?0*(\.0*)?$/.test(value);

export function buildReceiptPdfData(src: ReceiptPdfSource) {
  const fx = src.totals.fxDifference;
  return {
    title: 'RECIBO',
    number: src.number ?? 'Borrador',
    date: pdfDateText(src.date),
    watermark: src.status === 'CONFIRMED' ? null : src.status === 'CANCELLED' ? 'ANULADO' : 'BORRADOR — NO VÁLIDO',
    company: {
      name: src.company.name,
      cuit: formatCuitText(src.company.cuit),
      address: join([src.company.address, src.company.city, src.company.province]),
    },
    customer: {
      name: src.customer.name,
      cuit: formatCuitText(src.customer.cuit),
      vatCondition:
        src.customer.vatConditionId !== null && isReceiverVatConditionId(src.customer.vatConditionId)
          ? RECEIVER_VAT_CONDITIONS[src.customer.vatConditionId].label
          : '',
      address: join([src.customer.street, src.customer.city]),
    },
    lines: src.lines.map((l) => ({
      concept:
        l.kind === 'ADVANCE'
          ? join(['Cobro a cuenta', l.label], ' · ')
          : l.kind === 'ADVANCE_APPLIED'
            ? `Anticipo aplicado · ${l.label}`
            : l.label,
      detail: l.currency === 'ARS' ? null : `${l.currency} ${formatAmountText(l.applied)} a $ ${rateText(l.rate)}`,
      amount: money(l.ars),
    })),
    withholdings: src.withholdings.map((w) => ({
      tax: join([CUSTOMER_WITHHOLDING_TAX_LABELS[w.tax], w.jurisdiction], ' ') ?? '',
      certificate: `${w.certificateNumber} · ${pdfDateText(w.certificateDate)}`,
      amount: money(w.amount),
    })),
    payments: src.payments.map((p) => ({
      method: PAYMENT_METHOD_LABELS[p.method],
      detail: pdfPaymentDetail(p),
      amount: money(p.amount),
    })),
    totals: {
      invoices: money(src.totals.invoices),
      advance: money(src.totals.advance),
      advancesApplied: money(src.totals.advancesApplied),
      withholdings: money(src.totals.withholdings),
      received: money(src.totals.received),
      hasAdvance: !isZero(src.totals.advance),
      hasAdvancesApplied: !isZero(src.totals.advancesApplied),
      hasWithholdings: !isZero(src.totals.withholdings),
    },
    fxNote: isZero(fx)
      ? null
      : `Diferencia de cambio (informativa): ${fx.startsWith('-') ? 'pérdida' : 'ganancia'} de ${money(fx.replace('-', ''))} contra la cotización de los comprobantes`,
    notes: src.notes?.trim() || null,
  };
}

export type ReceiptPdfData = ReturnType<typeof buildReceiptPdfData>;
