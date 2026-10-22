import { parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { PAYMENT_METHODS } from '@/features/Purchases/schemas/payment-orders';
import { WITHHOLDING_TAXES } from '@/features/Purchases/schemas/payment-settings';
import { z } from 'zod';

import { isValidCuit } from '@/shared/utils/cuit-text';
import { RATE_SCALE } from '../lib/receipt-math';
import { DATE_RE, isCalendarDay, isPositiveAmount } from './shared';

/**
 * Recibo de cobranza (spec Tesorería etapa 2 §3.1). Módulo SIN directiva: lo usan el editor y
 * las actions. Importes como texto (coma o punto, hasta 2 decimales); cotizaciones hasta 6.
 * Lo que depende de la base (pendientes, cliente, cuentas) lo valida el servidor.
 */

export const FOREIGN_CURRENCIES = ['USD', 'EUR'] as const;

/** Etiquetas propias: en Compras "IIBB" es la retención de Neuquén que practica la empresa. */
export const CUSTOMER_WITHHOLDING_TAX_LABELS: Record<(typeof WITHHOLDING_TAXES)[number], string> = {
  GANANCIAS: 'Ganancias',
  IVA: 'IVA',
  IIBB: 'IIBB',
  SUSS: 'SUSS',
};

/** El PDF del certificado: hasta 10 MB. */
export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

const isRate = (value: string) => {
  const scaled = parseScaled(value, RATE_SCALE);
  return scaled !== null && scaled > BigInt(0);
};

export const receiptFormSchema = z
  .object({
    customerId: z.string().uuid('Elegí el cliente'),
    date: z.string().trim().regex(DATE_RE, 'Fecha inválida').refine(isCalendarDay, 'Fecha inválida'),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres'),
    rates: z.array(z.object({ currency: z.enum(FOREIGN_CURRENCIES), rate: z.string().trim() })),
    /** Importe en la moneda del comprobante. */
    invoices: z.array(z.object({ invoiceId: z.string().uuid('Comprobante inválido'), amount: z.string().trim() })),
    advancesApplied: z.array(
      z.object({ sourceLineId: z.string().uuid('Anticipo inválido'), amount: z.string().trim() })
    ),
    /** `amount` vacío = sin cobro a cuenta. */
    advance: z.object({ amount: z.string().trim(), description: z.string().trim().max(200, 'Máximo 200 caracteres') }),
    withholdings: z.array(
      z.object({
        /** '' = retención nueva. */
        id: z.string(),
        tax: z.enum(WITHHOLDING_TAXES),
        jurisdiction: z.string().trim().max(60, 'Máximo 60 caracteres'),
        certificateNumber: z.string().trim().min(1, 'Indicá el número del certificado').max(40, 'Máximo 40 caracteres'),
        certificateDate: z.string().trim().regex(DATE_RE, 'Fecha inválida').refine(isCalendarDay, 'Fecha inválida'),
        amount: z.string().trim(),
      })
    ),
    payments: z.array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        accountId: z.string(),
        amount: z.string().trim(),
        reference: z.string().trim().max(60, 'Máximo 60 caracteres'),
        checkNumber: z.string().trim().max(30, 'Máximo 30 caracteres'),
        checkBank: z.string().trim().max(60, 'Máximo 60 caracteres'),
        /** Fecha de pago del cheque. */
        checkDueOn: z.string().trim(),
        /** Solo cheques (etapa 3a): emisión y librador. Opcionales en el tipo para no exigirlos en los demás medios. */
        checkIssueDate: z.string().trim().optional(),
        drawerName: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
        drawerCuit: z.string().trim().optional(),
      })
    ),
    /** Deudas de cheques rechazados que se cobran (etapa 3a). */
    rejectedChecks: z
      .array(z.object({ checkId: z.string().uuid('Cheque inválido'), amount: z.string().trim() }))
      .optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    const currencies = new Set<string>();
    v.rates.forEach((r, i) => {
      if (!isRate(r.rate)) issue(['rates', i, 'rate'], 'Cotización inválida');
      if (currencies.has(r.currency)) issue(['rates', i, 'currency'], `La cotización del ${r.currency} está repetida`);
      currencies.add(r.currency);
    });

    const invoices = new Set<string>();
    v.invoices.forEach((line, i) => {
      if (!isPositiveAmount(line.amount)) issue(['invoices', i, 'amount'], 'Importe inválido');
      if (invoices.has(line.invoiceId)) issue(['invoices', i, 'invoiceId'], 'El comprobante está repetido');
      invoices.add(line.invoiceId);
    });

    const sources = new Set<string>();
    v.advancesApplied.forEach((line, i) => {
      if (!isPositiveAmount(line.amount)) issue(['advancesApplied', i, 'amount'], 'Importe inválido');
      if (sources.has(line.sourceLineId)) issue(['advancesApplied', i, 'sourceLineId'], 'El anticipo está repetido');
      sources.add(line.sourceLineId);
    });

    if (v.advance.amount && !isPositiveAmount(v.advance.amount)) issue(['advance', 'amount'], 'Importe inválido');

    v.withholdings.forEach((w, i) => {
      if (!isPositiveAmount(w.amount)) issue(['withholdings', i, 'amount'], 'Importe inválido');
      if (w.tax === 'IIBB' && !w.jurisdiction) issue(['withholdings', i, 'jurisdiction'], 'Indicá la jurisdicción');
      if (w.tax !== 'IIBB' && w.jurisdiction)
        issue(['withholdings', i, 'jurisdiction'], 'Solo IIBB lleva jurisdicción');
    });

    v.payments.forEach((p, i) => {
      if (!p.accountId) issue(['payments', i, 'accountId'], 'Elegí la cuenta o caja');
      if (!isPositiveAmount(p.amount)) issue(['payments', i, 'amount'], 'Importe inválido');
      if (p.method === 'CHECK' || p.method === 'ECHECK') {
        if (!p.checkNumber) issue(['payments', i, 'checkNumber'], 'Indicá el número del cheque');
        if (!p.checkBank) issue(['payments', i, 'checkBank'], 'Indicá el banco');
        if (!DATE_RE.test(p.checkDueOn)) issue(['payments', i, 'checkDueOn'], 'Indicá el vencimiento del cheque');
        else if (!isCalendarDay(p.checkDueOn)) issue(['payments', i, 'checkDueOn'], 'Fecha inválida');
        if (!DATE_RE.test(p.checkIssueDate ?? ''))
          issue(['payments', i, 'checkIssueDate'], 'Indicá la fecha de emisión');
        else if (!isCalendarDay(p.checkIssueDate ?? '')) issue(['payments', i, 'checkIssueDate'], 'Fecha inválida');
        else if (DATE_RE.test(p.checkDueOn) && p.checkDueOn < (p.checkIssueDate ?? '')) {
          issue(['payments', i, 'checkDueOn'], 'La fecha de pago no puede ser anterior a la de emisión');
        }
        if (!p.drawerName) issue(['payments', i, 'drawerName'], 'Indicá el librador');
        if (!isValidCuit(p.drawerCuit ?? '')) issue(['payments', i, 'drawerCuit'], 'CUIT inválido');
      }
    });

    const checks = new Set<string>();
    (v.rejectedChecks ?? []).forEach((line, i) => {
      if (!isPositiveAmount(line.amount)) issue(['rejectedChecks', i, 'amount'], 'Importe inválido');
      if (checks.has(line.checkId)) issue(['rejectedChecks', i, 'checkId'], 'El cheque rechazado está repetido');
      checks.add(line.checkId);
    });
  });

export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;

/** Formulario vacío del editor. */
export function emptyReceiptForm(date: string, customerId = ''): ReceiptFormValues {
  return {
    customerId,
    date,
    notes: '',
    rates: [],
    invoices: [],
    advancesApplied: [],
    advance: { amount: '', description: '' },
    withholdings: [],
    payments: [],
    rejectedChecks: [],
  };
}
