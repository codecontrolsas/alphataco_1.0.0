import { isSupportedCurrency } from '@/shared/lib/arca/catalogs';
import { formatAmountText } from '@/shared/utils/amount-text';
import { isValidCuit } from '@/shared/utils/cuit-text';
import { amountOf, compareAmounts, parseScaled, QUANTITY_SCALE } from './invoice-math';

/**
 * Validación de completitud antes de emitir. Pura: la usan el editor (checklist antes de abrir la
 * confirmación) y el servidor (otra vez, al emitir: la UI no alcanza). Devuelve TODO lo que falta,
 * cada ítem con el campo al que apunta para que la UI pueda enfocarlo.
 */

export type IssueProblem = { field: string; message: string };

export type InvoiceForValidation = {
  kind: 'invoice' | 'credit_note' | 'debit_note';
  issueDate: string;
  todayAr: string;
  concept: number;
  serviceFrom: string | null;
  serviceTo: string | null;
  paymentDueDate: string | null;
  currency: string;
  total: string;
  salesPoint: { active: boolean } | null;
  customer: {
    name: string;
    cuit: string;
    vatConditionId: number | null;
    street: string | null;
    city: string | null;
    postalCode: string | null;
  };
  lines: { description: string; quantity: string; netAmount: string; vatRateId: number | null }[];
  letter: { ok: true } | { ok: false; error: string };
  /** Lo que bloquea emitir a nivel empresa (datos fiscales, certificado, puntos de venta). */
  readinessBlockers: string[];
  /** Solo NC: saldo que todavía se puede acreditar del comprobante original. */
  creditableRemaining?: string;
};

/** Días que ARCA acepta antes/después de hoy: 5 para productos, 10 si incluye servicios. */
export function issueDateWindowDays(concept: number): number {
  return concept === 1 ? 5 : 10;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function validateInvoiceForIssue(invoice: InvoiceForValidation): IssueProblem[] {
  const problems: IssueProblem[] = [];
  const add = (field: string, message: string) => problems.push({ field, message });

  for (const blocker of invoice.readinessBlockers) {
    add('company', `Configuración: falta ${blocker}.`);
  }

  if (!invoice.salesPoint) add('salesPointId', 'Elegí un punto de venta.');
  else if (!invoice.salesPoint.active) add('salesPointId', 'El punto de venta elegido está desactivado.');

  const c = invoice.customer;
  if (!isValidCuit(c.cuit)) add('customer', `El CUIT de ${c.name} no es válido: corregilo en la ficha del cliente.`);
  if (c.vatConditionId === null) add('customer', `${c.name} no tiene cargada la condición frente al IVA.`);
  if (!c.street || !c.city || !c.postalCode) add('customer', `${c.name} no tiene completo el domicilio fiscal.`);
  if (!invoice.letter.ok) add('customer', invoice.letter.error);

  if (!isSupportedCurrency(invoice.currency)) add('currency', `La moneda ${invoice.currency} no se puede facturar.`);

  const window = issueDateWindowDays(invoice.concept);
  if (Math.abs(daysBetween(invoice.issueDate, invoice.todayAr)) > window) {
    add(
      'issueDate',
      `La fecha de emisión tiene que estar dentro de los ${window} días anteriores o posteriores a hoy.`
    );
  }

  if (invoice.concept !== 1) {
    if (!invoice.serviceFrom || !invoice.serviceTo) {
      add('serviceFrom', 'El período facturado tiene que estar completo (servicios).');
    } else if (invoice.serviceTo < invoice.serviceFrom) {
      add('serviceTo', 'El período facturado termina antes de empezar.');
    }
    if (!invoice.paymentDueDate) add('paymentDueDate', 'Ingresá el vencimiento del pago (servicios).');
    else if (invoice.paymentDueDate < invoice.issueDate) {
      add('paymentDueDate', 'El vencimiento del pago no puede ser anterior a la fecha de emisión.');
    }
  }

  if (invoice.lines.length === 0) add('lines', 'Agregá al menos una línea.');
  invoice.lines.forEach((line, index) => {
    const n = index + 1;
    if (!line.description.trim()) add(`lines.${index}.description`, `Línea ${n}: escribí la descripción.`);
    const quantity = parseScaled(line.quantity, QUANTITY_SCALE);
    if (quantity === null || quantity <= BigInt(0))
      add(`lines.${index}.quantity`, `Línea ${n}: ingresá una cantidad mayor a 0.`);
    if (amountOf(line.netAmount) <= BigInt(0))
      add(`lines.${index}.unitPrice`, `Línea ${n}: el importe tiene que ser mayor a 0.`);
  });

  if (amountOf(invoice.total) <= BigInt(0)) add('total', 'El total tiene que ser mayor a 0.');

  if (invoice.kind === 'credit_note' && invoice.creditableRemaining !== undefined) {
    if (compareAmounts(invoice.total, invoice.creditableRemaining) > 0) {
      add(
        'total',
        `La nota de crédito supera el saldo del comprobante original (saldo disponible: ${invoice.currency} ${formatAmountText(invoice.creditableRemaining)}).`
      );
    }
  }

  return problems;
}
