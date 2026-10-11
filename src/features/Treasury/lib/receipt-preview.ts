import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import type { ReceiptFormValues } from '../schemas/receipts';
import { appliedToArs, closingGap, formatPesos, fxDifference, RATE_SCALE, receiptTotals, type ReceiptLineAmounts } from './receipt-math';

/**
 * Totales del recibo en vivo para el editor, con las mismas cuentas que hace el servidor al
 * guardar (`receipt-math`). Los importes que todavía no son números no suman.
 */

const ZERO = BigInt(0);
const RATE_ONE = BigInt(1000000);
const money = (cents: bigint) => formatScaled(cents, AMOUNT_SCALE);
const cents = (value: string) => parseScaled(value, AMOUNT_SCALE) ?? ZERO;

export type ReceiptPreview = {
  /** Pesos y diferencia de cambio por comprobante (solo los que se pueden calcular). */
  lines: Record<string, { ars: string; fx: string }>;
  totals: { invoices: string; advance: string; advancesApplied: string; withholdings: string; received: string; fxDifference: string };
  /** Comprobantes + cobro a cuenta, y anticipos + retenciones + medios. */
  charged: string;
  delivered: string;
  /** > 0 faltan, < 0 sobran. */
  gap: string;
  closing: string;
  closes: boolean;
  /** Monedas de comprobantes tildados sin cotización cargada. */
  missingRates: string[];
};

export function previewReceipt(values: ReceiptFormValues, invoices: Record<string, { currency: string; exchangeRate: string }>): ReceiptPreview {
  const rates = new Map(values.rates.map((r) => [r.currency as string, parseScaled(r.rate, RATE_SCALE)]));
  const missing = new Set<string>();
  const lines: ReceiptLineAmounts[] = [];
  const perInvoice: ReceiptPreview['lines'] = {};

  for (const line of values.invoices) {
    const invoice = invoices[line.invoiceId];
    if (!invoice) continue;
    const rate = invoice.currency === 'ARS' ? RATE_ONE : rates.get(invoice.currency);
    if (!rate || rate <= ZERO) {
      missing.add(invoice.currency);
      continue;
    }
    const applied = cents(line.amount);
    const ars = appliedToArs(applied, rate);
    const fx = invoice.currency === 'ARS' ? ZERO : fxDifference(applied, rate, parseScaled(invoice.exchangeRate, RATE_SCALE) ?? RATE_ONE);
    lines.push({ kind: 'INVOICE', amountArs: ars, fxDifference: fx });
    perInvoice[line.invoiceId] = { ars: money(ars), fx: money(fx) };
  }
  for (const line of values.advancesApplied) lines.push({ kind: 'ADVANCE_APPLIED', amountArs: cents(line.amount), fxDifference: ZERO });
  if (values.advance.amount) lines.push({ kind: 'ADVANCE', amountArs: cents(values.advance.amount), fxDifference: ZERO });

  const totals = receiptTotals({
    lines,
    withholdings: values.withholdings.map((w) => cents(w.amount)),
    payments: values.payments.map((p) => cents(p.amount)),
  });
  const gap = closingGap(totals);
  return {
    lines: perInvoice,
    totals: {
      invoices: money(totals.invoicesTotal),
      advance: money(totals.advanceTotal),
      advancesApplied: money(totals.advancesAppliedTotal),
      withholdings: money(totals.withholdingsTotal),
      received: money(totals.receivedTotal),
      fxDifference: money(totals.fxDifferenceTotal),
    },
    charged: money(totals.invoicesTotal + totals.advanceTotal),
    delivered: money(totals.advancesAppliedTotal + totals.withholdingsTotal + totals.receivedTotal),
    gap: money(gap),
    closing: gap === ZERO ? 'Cierra' : `${gap > ZERO ? 'Faltan' : 'Sobran'} ${formatPesos(gap > ZERO ? gap : -gap)}`,
    closes: gap === ZERO,
    missingRates: [...missing],
  };
}
