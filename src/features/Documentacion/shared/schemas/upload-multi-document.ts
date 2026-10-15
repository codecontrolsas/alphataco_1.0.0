import { z } from 'zod';

/**
 * Schema del formulario de carga multirrecurso (empleados y equipos). Módulo SIN `'use client'`:
 * el tipo se infiere de acá y lo comparten los dos formularios. La obligatoriedad de vencimiento y
 * período depende del tipo elegido, así que se pasa por parámetro.
 */
const REQUIRED = 'Este campo es requerido';

const baseSchema = z.object({
  applies: z.array(z.string({ required_error: REQUIRED }).uuid()),
  document_path: z.string({ required_error: REQUIRED }),
  validity: z.string().optional(),
  id_document_types: z.string({ required_error: REQUIRED }).uuid(),
  period: z.string().optional(),
  /** N° de póliza: siempre opcional, sólo se muestra si el tipo lo lleva (equipos). */
  policy_number: z.string().optional(),
});

export type UploadMultiDocumentValues = z.infer<typeof baseSchema>;

export function createUploadMultiDocumentSchema(options: { requiresValidity: boolean; requiresPeriod: boolean }) {
  return baseSchema.superRefine((values, ctx) => {
    if (options.requiresValidity && !values.validity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validity'], message: REQUIRED });
    }
    if (options.requiresPeriod && !values.period) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['period'], message: REQUIRED });
    }
  });
}
