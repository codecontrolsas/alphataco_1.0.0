import { z } from 'zod';
import { DATE_RE, UUID_RE, isPositiveAmount } from './shared';

/** Transferencias entre cuentas (spec Tesorería etapa 1 §3). Módulo SIN directiva. */

export const transferFormSchema = z
  .object({
    fromAccountId: z.string().regex(UUID_RE, 'Elegí la cuenta de origen'),
    toAccountId: z.string().regex(UUID_RE, 'Elegí la cuenta de destino'),
    date: z.string().regex(DATE_RE, 'Indicá la fecha'),
    amount: z.string().trim().refine(isPositiveAmount, 'El importe tiene que ser mayor a 0'),
    notes: z.string().trim().max(200, 'Máximo 200 caracteres'),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ['toAccountId'], message: 'Elegí cuentas distintas' });

export type TransferFormValues = z.infer<typeof transferFormSchema>;
