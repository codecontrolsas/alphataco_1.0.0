import { z } from 'zod';

export const certificationFormSchema = z
  .object({
    customerServiceId: z.string().uuid({ message: 'El contrato es requerido' }),
    periodFrom: z
      .string()
      .min(1, { message: 'La fecha desde es requerida' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha desde no es válida' }),
    periodTo: z
      .string()
      .min(1, { message: 'La fecha hasta es requerida' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha hasta no es válida' }),
    notes: z.string().trim().optional(),
  })
  .refine((v) => v.periodTo >= v.periodFrom, {
    message: 'El período no puede terminar antes de empezar',
    path: ['periodTo'],
  });

export type CertificationFormValues = z.infer<typeof certificationFormSchema>;

/** Motivo de anulación: obligatorio, queda guardado en el documento. */
export const voidCertificationSchema = z.object({
  reason: z.string().trim().min(1, { message: 'Indicá por qué se anula' }),
});

export type VoidCertificationValues = z.infer<typeof voidCertificationSchema>;
