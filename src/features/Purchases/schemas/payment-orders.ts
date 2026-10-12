import { z } from 'zod';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { WITHHOLDING_TAXES } from './payment-settings';

/**
 * Orden de pago y registro del pago (spec Compras etapa 5 §3). Modulo SIN directiva: lo usan el
 * formulario y las actions. Importes como texto (coma o punto, hasta 2 decimales).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positive = (value: string) => {
  const scaled = parseScaled(value, AMOUNT_SCALE);
  return scaled !== null && scaled > BigInt(0);
};
const nonNegative = (value: string) => {
  const scaled = parseScaled(value, AMOUNT_SCALE);
  return scaled !== null && scaled >= BigInt(0);
};

export const PAYMENT_LINE_KINDS = ['INVOICE', 'CREDIT_NOTE', 'ADVANCE_APPLIED', 'REJECTED_CHECK'] as const;

export const paymentOrderFormSchema = z
  .object({
    supplierId: z.string().uuid('Elegí el proveedor'),
    plannedOn: z.string().trim().regex(DATE_RE, 'Fecha inválida'),
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
    lines: z.array(
      z.object({
        kind: z.enum(PAYMENT_LINE_KINDS),
        invoiceId: z.string(),
        sourceLineId: z.string(),
        /** Cheque de tercero rechazado (solo kind = REJECTED_CHECK). */
        checkId: z.string().optional(),
        amount: z.string().trim(),
      })
    ),
    advance: z.object({
      amount: z.string().trim(),
      purchaseOrderId: z.string(),
      description: z.string().trim().max(200, 'Máximo 200 caracteres'),
    }),
    /** Correcciones a mano: reemplazan el importe calculado de ese impuesto (0 = no retener). */
    manualWithholdings: z.array(
      z.object({
        tax: z.enum(WITHHOLDING_TAXES),
        amount: z.string().trim(),
        reason: z.string().trim().max(200, 'Máximo 200 caracteres'),
      })
    ),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const seen = new Set<string>();
    v.lines.forEach((line, i) => {
      if (!positive(line.amount)) issue(['lines', i, 'amount'], 'Importe inválido');
      const key = line.kind === 'ADVANCE_APPLIED' ? line.sourceLineId : line.kind === 'REJECTED_CHECK' ? (line.checkId ?? '') : line.invoiceId;
      if (!key) issue(['lines', i], 'Falta el comprobante o el anticipo');
      else if (seen.has(key)) issue(['lines', i], 'El mismo comprobante o anticipo está dos veces');
      seen.add(key);
    });
    if (v.advance.amount && !positive(v.advance.amount)) issue(['advance', 'amount'], 'Importe inválido');
    const taxes = new Set<string>();
    v.manualWithholdings.forEach((m, i) => {
      if (!nonNegative(m.amount)) issue(['manualWithholdings', i, 'amount'], 'Importe inválido');
      if (!m.reason) issue(['manualWithholdings', i, 'reason'], 'Indicá por qué se corrige');
      if (taxes.has(m.tax)) issue(['manualWithholdings', i, 'tax'], 'Ese impuesto ya está corregido');
      taxes.add(m.tax);
    });
  });

export type PaymentOrderFormValues = z.infer<typeof paymentOrderFormSchema>;

/** Medios de cobro y pago comunes (el recibo usa solo estos). */
export const PAYMENT_METHODS = ['TRANSFER', 'CHECK', 'ECHECK', 'CASH'] as const;
/** Medios del pago a proveedores: suman el endoso de un cheque de tercero de la cartera (Tesorería etapa 3a). */
export const SUPPLIER_PAYMENT_METHODS = [...PAYMENT_METHODS, 'THIRD_PARTY_CHECK'] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof SUPPLIER_PAYMENT_METHODS)[number], string> = {
  TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  ECHECK: 'E-cheq',
  CASH: 'Efectivo',
  THIRD_PARTY_CHECK: 'Cheque de tercero',
};

export const registerPaymentFormSchema = z
  .object({
    paidOn: z.string().trim().regex(DATE_RE, 'Fecha inválida'),
    payments: z
      .array(
        z.object({
          method: z.enum(SUPPLIER_PAYMENT_METHODS),
          accountId: z.string(),
          amount: z.string().trim(),
          reference: z.string().trim().max(60, 'Máximo 60 caracteres'),
          checkNumber: z.string().trim().max(30, 'Máximo 30 caracteres'),
          checkBank: z.string().trim().max(60, 'Máximo 60 caracteres'),
          checkDueOn: z.string().trim(),
          /** Cheque de la cartera que se endosa (solo THIRD_PARTY_CHECK): su importe y su cartera los pone el servidor. */
          thirdPartyCheckId: z.string().optional(),
          /** Chequera del cheque propio físico (solo CHECK, Tesorería etapa 3b): la cuenta sale de la chequera. */
          checkbookId: z.string().optional(),
        })
      ),
  })
  .superRefine((v, ctx) => {
    const checks = new Set<string>();
    v.payments.forEach((p, i) => {
      const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: ['payments', i, field], message });
      if (p.method === 'THIRD_PARTY_CHECK') {
        const id = p.thirdPartyCheckId ?? '';
        if (!UUID_RE.test(id)) issue('thirdPartyCheckId', 'Elegí el cheque');
        else if (checks.has(id)) issue('thirdPartyCheckId', 'El cheque está dos veces');
        checks.add(id);
        return;
      }
      if (p.method === 'CHECK') {
        if (!UUID_RE.test(p.checkbookId ?? '')) issue('checkbookId', 'Elegí la chequera');
      } else if (!p.accountId) issue('accountId', p.method === 'ECHECK' ? 'Elegí la cuenta bancaria' : 'Elegí la cuenta o caja');
      if (!positive(p.amount)) issue('amount', 'Importe inválido');
      if (p.method === 'CHECK' || p.method === 'ECHECK') {
        if (!p.checkNumber) issue('checkNumber', 'Indicá el número del cheque');
        if (!DATE_RE.test(p.checkDueOn)) issue('checkDueOn', 'Indicá la fecha de pago del cheque');
        else if (DATE_RE.test(v.paidOn) && p.checkDueOn < v.paidOn) issue('checkDueOn', 'La fecha de pago del cheque no puede ser anterior a la del pago');
      }
    });
  });

export type RegisterPaymentFormValues = z.infer<typeof registerPaymentFormSchema>;
