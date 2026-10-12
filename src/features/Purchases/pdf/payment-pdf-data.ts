import { RECEIVER_VAT_CONDITIONS, isReceiverVatConditionId } from '@/shared/lib/arca/catalogs';
import { formatAmountText } from '@/shared/utils/amount-text';
import { formatCuitText } from '@/shared/utils/cuit-text';
import moment from 'moment';
import { PAYMENT_METHOD_LABELS } from '../schemas/payment-orders';
import { WITHHOLDING_TAX_LABELS, type WithholdingTax } from '../schemas/payment-settings';
import type { PaymentOrderStatus } from '../lib/payment-order-state-machine';

/**
 * View-model del PDF de la orden de pago y de sus certificados de retencion (spec Compras etapa 5
 * §4). Puro: recibe los datos ya leidos y devuelve texto formateado.
 */

export type PaymentPdfSource = {
  number: string;
  /** Fecha de pago (o prevista si no se pago), `YYYY-MM-DD`. */
  date: string;
  status: PaymentOrderStatus;
  company: { name: string; cuit: string; address: string | null; city: string | null; province: string | null; grossIncomeNumber: string | null };
  supplier: { name: string; cuit: string; vatConditionId: number; street: string | null; city: string | null; province: string | null };
  lines: { kind: 'INVOICE' | 'CREDIT_NOTE' | 'ADVANCE' | 'ADVANCE_APPLIED' | 'REJECTED_CHECK'; label: string; amount: string }[];
  withholdings: {
    tax: WithholdingTax;
    regimeCode: string;
    regimeDescription: string;
    base: string;
    rate: string;
    amount: string;
    certificateNumber: string | null;
    cancelled: boolean;
  }[];
  payments: {
    method: keyof typeof PAYMENT_METHOD_LABELS;
    account: string;
    amount: string;
    reference: string | null;
    checkNumber: string | null;
    checkBank: string | null;
    checkDueOn: string | null;
    /** Librador del cheque de tercero endosado (Tesoreria etapa 3a). */
    drawerName?: string | null;
  }[];
  totals: { invoicesTotal: string; creditsTotal: string; advanceTotal: string; withholdingsTotal: string; netTotal: string };
  notes: string | null;
};

const money = (value: string) => (value.startsWith('-') ? `-$ ${formatAmountText(value.slice(1))}` : `$ ${formatAmountText(value)}`);
const dateText = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');
const join = (parts: (string | null)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(', ') || null;
const rateText = (value: string) => `${value.replace('.', ',')} %`;

const SUBTRACTS = new Set(['CREDIT_NOTE', 'ADVANCE_APPLIED']);

export function buildPaymentPdfData(src: PaymentPdfSource) {
  const company = {
    name: src.company.name,
    cuit: formatCuitText(src.company.cuit),
    address: join([src.company.address, src.company.city, src.company.province]),
    grossIncomeNumber: src.company.grossIncomeNumber,
  };
  const supplier = {
    name: src.supplier.name,
    cuit: formatCuitText(src.supplier.cuit),
    vatCondition: isReceiverVatConditionId(src.supplier.vatConditionId) ? RECEIVER_VAT_CONDITIONS[src.supplier.vatConditionId].label : '',
    address: join([src.supplier.street, src.supplier.city, src.supplier.province]),
  };
  return {
    title: 'ORDEN DE PAGO',
    number: src.number,
    date: dateText(src.date),
    watermark: src.status === 'PAID' ? null : src.status === 'CANCELLED' ? 'ANULADA' : 'BORRADOR — NO VÁLIDA',
    company,
    supplier,
    lines: src.lines.map((l) => ({
      concept:
        l.kind === 'ADVANCE' ? `Anticipo${l.label ? ` · ${l.label}` : ''}` : l.kind === 'ADVANCE_APPLIED' ? `Anticipo aplicado · ${l.label}` : l.label,
      amount: SUBTRACTS.has(l.kind) ? money(`-${l.amount}`) : money(l.amount),
    })),
    withholdings: src.withholdings.map((w) => ({
      tax: WITHHOLDING_TAX_LABELS[w.tax],
      certificate: w.certificateNumber ?? '—',
      amount: money(w.amount),
    })),
    payments: src.payments.map((p) => ({
      method: PAYMENT_METHOD_LABELS[p.method],
      detail: [
        p.account,
        p.reference,
        p.checkNumber ? `N° ${p.checkNumber}` : null,
        p.checkBank,
        p.drawerName ? `librador ${p.drawerName}` : null,
        p.checkDueOn ? `pago ${dateText(p.checkDueOn)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      amount: money(p.amount),
    })),
    totals: {
      invoices: money(src.totals.invoicesTotal),
      credits: money(src.totals.creditsTotal),
      advance: money(src.totals.advanceTotal),
      withholdings: money(src.totals.withholdingsTotal),
      net: money(src.totals.netTotal),
      hasAdvance: Number(src.totals.advanceTotal) !== 0,
      hasCredits: Number(src.totals.creditsTotal) !== 0,
    },
    notes: src.notes?.trim() || null,
    certificates: src.withholdings
      .filter((w) => w.certificateNumber)
      .map((w) => ({
        number: w.certificateNumber!,
        date: dateText(src.date),
        tax: WITHHOLDING_TAX_LABELS[w.tax],
        regime: `${w.regimeCode} · ${w.regimeDescription}`,
        base: money(w.base),
        rate: rateText(w.rate),
        amount: money(w.amount),
        orderNumber: src.number,
        cancelled: w.cancelled,
        agent: company,
        subject: supplier,
      })),
  };
}

export type PaymentPdfData = ReturnType<typeof buildPaymentPdfData>;
