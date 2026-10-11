import { AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { formatAmountText } from '@/shared/utils/amount-text';

/**
 * Cuentas del recibo de cobranza (spec Tesorería etapa 2 §2.1 y §2.2). Importes en centavos y
 * cotizaciones en millonésimas, siempre BigInt: nada pasa por `Number`.
 */

/** Decimales de una cotización (`Decimal(18,6)`, igual que `invoices.exchange_rate`). */
export const RATE_SCALE = 6;

const ZERO = BigInt(0);
const TWO = BigInt(2);
const RATE_UNIT = BigInt(1000000);

/** División entera redondeando mitad lejos del cero (ROUND_HALF_UP para positivos). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < ZERO !== denominator < ZERO;
  const n = numerator < ZERO ? -numerator : numerator;
  const d = denominator < ZERO ? -denominator : denominator;
  const quotient = (n * TWO + d) / (d * TWO);
  return negative ? -quotient : quotient;
}

/** Pesos de una línea: round(applied × cotización, 2). */
export function appliedToArs(appliedCents: bigint, rateMicros: bigint): bigint {
  return divRound(appliedCents * rateMicros, RATE_UNIT);
}

/** Importe en la moneda del comprobante para `arsCents` pesos: round(pesos / cotización, 2). */
export function arsToApplied(arsCents: bigint, rateMicros: bigint): bigint {
  return divRound(arsCents * RATE_UNIT, rateMicros);
}

/** applied × (cotización del cobro − cotización del comprobante). Con signo: positiva es ganancia. */
export function fxDifference(appliedCents: bigint, rateMicros: bigint, invoiceRateMicros: bigint): bigint {
  return divRound(appliedCents * (rateMicros - invoiceRateMicros), RATE_UNIT);
}

export type ReceiptLineAmounts = { kind: 'INVOICE' | 'ADVANCE' | 'ADVANCE_APPLIED' | 'REJECTED_CHECK'; amountArs: bigint; fxDifference: bigint };

export type ReceiptTotals = {
  invoicesTotal: bigint;
  advanceTotal: bigint;
  advancesAppliedTotal: bigint;
  withholdingsTotal: bigint;
  receivedTotal: bigint;
  fxDifferenceTotal: bigint;
};

const sum = (values: bigint[]) => values.reduce((acc, v) => acc + v, ZERO);

export function receiptTotals(input: { lines: ReceiptLineAmounts[]; withholdings: bigint[]; payments: bigint[] }): ReceiptTotals {
  const of = (kind: ReceiptLineAmounts['kind']) => sum(input.lines.filter((l) => l.kind === kind).map((l) => l.amountArs));
  return {
    // La deuda de un cheque rechazado se cobra como un comprobante más.
    invoicesTotal: of('INVOICE') + of('REJECTED_CHECK'),
    advanceTotal: of('ADVANCE'),
    advancesAppliedTotal: of('ADVANCE_APPLIED'),
    withholdingsTotal: sum(input.withholdings),
    receivedTotal: sum(input.payments),
    fxDifferenceTotal: sum(input.lines.map((l) => l.fxDifference)),
  };
}

/** (comprobantes + a cuenta) − (anticipos aplicados + retenciones + medios). > 0 faltan, < 0 sobran. */
export function closingGap(t: ReceiptTotals): bigint {
  return t.invoicesTotal + t.advanceTotal - (t.advancesAppliedTotal + t.withholdingsTotal + t.receivedTotal);
}

/** Pesos para un mensaje: "$ 1.250,00". */
export function formatPesos(cents: bigint): string {
  return `$ ${formatAmountText(formatScaled(cents, AMOUNT_SCALE))}`;
}

/** Mensaje del recibo que no cierra, o `null` si cierra. */
export function closingError(gap: bigint): string | null {
  if (gap === ZERO) return null;
  const abs = gap < ZERO ? -gap : gap;
  return `El recibo no cierra: ${gap > ZERO ? 'faltan' : 'sobran'} ${formatPesos(abs)}`;
}
