import { z } from 'zod';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { isValidCuit } from '@/features/Empresa/General/lib/company-form';
import { DATE_RE, isPositiveAmount } from './shared';

/**
 * Cheques de terceros (spec Tesorería etapa 3a). Módulo SIN directiva: lo usan los formularios y
 * las actions. Lo que depende de la base (estado del cheque, cuentas, fechas mínimas) lo valida
 * el servidor.
 */

const dateField = z.string().trim().regex(DATE_RE, 'Fecha inválida');
const nonNegativeAmount = z
  .string()
  .trim()
  .refine((value) => {
    const scaled = parseScaled(value === '' ? '0' : value, AMOUNT_SCALE);
    return scaled !== null && scaled >= BigInt(0);
  }, 'Importe inválido');

export const CHECK_KINDS = ['PHYSICAL', 'ECHECK'] as const;

/** Datos de un cheque: la carga inicial los usa tal cual; el recibo repite estas reglas en su medio. */
export const checkDataSchema = z
  .object({
    kind: z.enum(CHECK_KINDS),
    number: z.string().trim().min(1, 'Indicá el número del cheque').max(30, 'Máximo 30 caracteres'),
    bank: z.string().trim().min(1, 'Indicá el banco').max(60, 'Máximo 60 caracteres'),
    drawerName: z.string().trim().min(1, 'Indicá el librador').max(120, 'Máximo 120 caracteres'),
    drawerCuit: z.string().trim().refine(isValidCuit, 'CUIT inválido'),
    issueDate: dateField,
    paymentDate: dateField,
    amount: z.string().trim().refine(isPositiveAmount, 'Importe inválido'),
  })
  .refine((c) => c.paymentDate >= c.issueDate, { path: ['paymentDate'], message: 'La fecha de pago no puede ser anterior a la de emisión' });

export type CheckDataValues = z.infer<typeof checkDataSchema>;

export const openingChecksSchema = z.object({
  portfolioId: z.string().uuid('Elegí la cartera'),
  date: dateField,
  customerId: z.string().uuid('Elegí el cliente'),
  checks: z.array(checkDataSchema).min(1, 'Cargá al menos un cheque'),
});
export type OpeningChecksValues = z.infer<typeof openingChecksSchema>;

const noRepeated = (ids: string[]) => new Set(ids).size === ids.length;

export const depositSchema = z.object({
  bankAccountId: z.string().uuid('Elegí la cuenta'),
  date: dateField,
  slipNumber: z.string().trim().max(40, 'Máximo 40 caracteres'),
  items: z
    .array(z.object({ checkId: z.string().uuid('Cheque inválido'), creditedOn: dateField }))
    .min(1, 'Elegí al menos un cheque')
    .refine((items) => noRepeated(items.map((i) => i.checkId)), 'El cheque está dos veces'),
});
export type DepositValues = z.infer<typeof depositSchema>;

export const discountSchema = z.object({
  bankAccountId: z.string().uuid('Elegí la cuenta'),
  date: dateField,
  interest: nonNegativeAmount,
  fee: nonNegativeAmount,
  reference: z.string().trim().max(60, 'Máximo 60 caracteres'),
  checkIds: z
    .array(z.string().uuid('Cheque inválido'))
    .min(1, 'Elegí al menos un cheque')
    .refine(noRepeated, 'El cheque está dos veces'),
});
export type DiscountValues = z.infer<typeof discountSchema>;

export const RETURNED_BY = ['BANK', 'SUPPLIER'] as const;
export const RETURNED_BY_LABELS: Record<(typeof RETURNED_BY)[number], string> = { BANK: 'Banco', SUPPLIER: 'Proveedor' };

export const rejectionSchema = z.object({
  checkId: z.string().uuid('Cheque inválido'),
  date: dateField,
  reason: z.string().trim().min(1, 'Indicá el motivo').max(300, 'Máximo 300 caracteres'),
  returnedBy: z.enum(RETURNED_BY),
});
export type RejectionValues = z.infer<typeof rejectionSchema>;
