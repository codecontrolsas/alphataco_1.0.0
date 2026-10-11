import { z } from 'zod';
import { MAX_CHECKBOOK_SIZE, normalizeCheckNumber } from '../lib/own-check-transitions';
import { DATE_RE } from './shared';

/**
 * Cheques propios y chequeras (spec Tesorería etapa 3b). Módulo SIN directiva: lo usan los
 * formularios y las actions. Lo que depende de la base (estado, rango libre, fechas mínimas) lo
 * valida el servidor.
 */

const dateField = z.string().trim().regex(DATE_RE, 'Fecha inválida');
const checkNumber = z.string().refine((value) => normalizeCheckNumber(value) !== null, 'Número inválido');

export const ownCheckReasonSchema = z.string().trim().min(1, 'Indicá el motivo').max(300, 'Máximo 300 caracteres');

export const checkbookSchema = z
  .object({
    accountId: z.string().uuid('Elegí la cuenta bancaria'),
    firstNumber: checkNumber,
    lastNumber: checkNumber,
  })
  .superRefine((v, ctx) => {
    const first = normalizeCheckNumber(v.firstNumber);
    const last = normalizeCheckNumber(v.lastNumber);
    if (first === null || last === null) return;
    if (Number(last) < Number(first)) ctx.addIssue({ code: 'custom', path: ['lastNumber'], message: 'El hasta no puede ser menor que el desde' });
    else if (Number(last) - Number(first) + 1 > MAX_CHECKBOOK_SIZE) {
      ctx.addIssue({ code: 'custom', path: ['lastNumber'], message: `Una chequera tiene hasta ${MAX_CHECKBOOK_SIZE} números` });
    }
  });
export type CheckbookValues = z.infer<typeof checkbookSchema>;

export const voidCheckNumberSchema = z.object({
  checkbookId: z.string().uuid('Elegí la chequera'),
  number: checkNumber,
  reason: ownCheckReasonSchema,
});
export type VoidCheckNumberValues = z.infer<typeof voidCheckNumberSchema>;

export const debitOwnChecksSchema = z.object({
  checkIds: z
    .array(z.string().uuid('Cheque inválido'))
    .min(1, 'Elegí al menos un cheque')
    .refine((ids) => new Set(ids).size === ids.length, 'El cheque está dos veces'),
  date: dateField,
});
export type DebitOwnChecksValues = z.infer<typeof debitOwnChecksSchema>;

export const rejectOwnCheckSchema = z.object({
  date: dateField,
  reason: ownCheckReasonSchema,
});
export type RejectOwnCheckValues = z.infer<typeof rejectOwnCheckSchema>;
