import { z } from 'zod';

/** Envío del recibo al cliente: uno o varios mails separados por coma o punto y coma. Módulo SIN directiva. */

export function splitEmails(value: string): string[] {
  return [...new Set(value.split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

export const sendReceiptFormSchema = z.object({
  to: z
    .string()
    .trim()
    .refine((value) => splitEmails(value).length > 0, 'Indicá al menos un mail')
    .refine((value) => splitEmails(value).every((email) => z.string().email().safeParse(email).success), 'Hay un mail inválido'),
  message: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
});

export type SendReceiptFormValues = z.infer<typeof sendReceiptFormSchema>;
