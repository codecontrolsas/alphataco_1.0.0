import { z } from 'zod';
import { DATE_RE, UUID_RE, isNonZeroAmount, isPositiveAmount } from './shared';

/** Movimientos manuales y saldo inicial (spec Tesorería etapa 1 §3). Módulo SIN directiva. */

export const MOVEMENT_DIRECTION_LABELS = { IN: 'Ingreso', OUT: 'Egreso' } as const;

export const TREASURY_MOVEMENT_KIND_LABELS = {
  OPENING: 'Saldo inicial',
  MANUAL: 'Manual',
  TRANSFER: 'Transferencia',
  SUPPLIER_PAYMENT: 'Pago a proveedor',
  CUSTOMER_RECEIPT: 'Cobro a cliente',
} as const;

export const manualMovementFormSchema = z.object({
  accountId: z.string().regex(UUID_RE, 'Elegí la cuenta'),
  date: z.string().regex(DATE_RE, 'Indicá la fecha'),
  direction: z.enum(['IN', 'OUT']),
  amount: z.string().trim().refine(isPositiveAmount, 'El importe tiene que ser mayor a 0'),
  conceptId: z.string().regex(UUID_RE, 'Elegí el concepto'),
  description: z.string().trim().max(200, 'Máximo 200 caracteres'),
});

export type ManualMovementFormValues = z.infer<typeof manualMovementFormSchema>;

export const openingBalanceFormSchema = z.object({
  accountId: z.string().regex(UUID_RE, 'Elegí la cuenta'),
  date: z.string().regex(DATE_RE, 'Indicá la fecha'),
  amount: z.string().trim().refine(isNonZeroAmount, 'Importe inválido'),
});

export type OpeningBalanceFormValues = z.infer<typeof openingBalanceFormSchema>;

/** Motivo de anulación (movimientos y transferencias). */
export const cancelReasonSchema = z.string().trim().min(1, 'Indicá el motivo').max(300, 'Máximo 300 caracteres');
