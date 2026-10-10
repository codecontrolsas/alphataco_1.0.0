import { z } from 'zod';
import { DATE_RE, isNonZeroAmount } from './shared';

/** Cuentas bancarias y cajas (spec Tesorería etapa 1 §2.1). Módulo SIN directiva. */

export const TREASURY_ACCOUNT_KIND_LABELS = { BANK: 'Cuenta bancaria', CASH: 'Caja' } as const;

export const treasuryAccountFormSchema = z
  .object({
    kind: z.enum(['BANK', 'CASH']),
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
    bankName: z.string().trim().max(80, 'Máximo 80 caracteres'),
    accountNumber: z.string().trim().max(40, 'Máximo 40 caracteres'),
    cbu: z.string().trim(),
    /** Saldo inicial opcional (solo en el alta): fecha e importe van juntos. */
    openingDate: z.string().trim(),
    openingAmount: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.cbu && !/^\d{22}$/.test(v.cbu)) ctx.addIssue({ code: 'custom', path: ['cbu'], message: 'El CBU tiene 22 dígitos' });
    if (v.openingAmount && !v.openingDate) {
      ctx.addIssue({ code: 'custom', path: ['openingDate'], message: 'Indicá la fecha del saldo inicial' });
    }
    if (v.openingDate && !DATE_RE.test(v.openingDate)) ctx.addIssue({ code: 'custom', path: ['openingDate'], message: 'Fecha inválida' });
    if (v.openingDate && !v.openingAmount) {
      ctx.addIssue({ code: 'custom', path: ['openingAmount'], message: 'Indicá el importe del saldo inicial' });
    }
    if (v.openingAmount && !isNonZeroAmount(v.openingAmount)) {
      ctx.addIssue({ code: 'custom', path: ['openingAmount'], message: 'Importe inválido' });
    }
  });

export type TreasuryAccountFormValues = z.infer<typeof treasuryAccountFormSchema>;
