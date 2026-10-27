import { z } from 'zod';

/**
 * Schemas de los documentos HSE. Módulo SIN directiva: los usan el formulario (cliente) y las actions (servidor).
 * Ver la Learned Correction "Schemas Zod compartidos server/client".
 */

const optionalDay = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Fecha inválida')
  .optional();

export const hseTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('position'), refId: z.string().uuid('Elegí el puesto') }),
  z.object({ kind: z.literal('sector'), refId: z.string().uuid('Elegí el sector') }),
  z.object({ kind: z.literal('employee'), refId: z.string().uuid('Elegí el empleado') }),
]);
export type HseTargetInput = z.infer<typeof hseTargetSchema>;

export const hseDocumentFormSchema = z.object({
  title: z.string().trim().min(3, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  description: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
  typeId: z.string().uuid().or(z.literal('')).optional(),
  /** Vencimiento del documento (de su versión vigente), `YYYY-MM-DD` o vacío. */
  expiresAt: optionalDay,
  targets: z.array(hseTargetSchema).min(1, 'Elegí al menos un destinatario'),
});
export type HseDocumentFormValues = z.infer<typeof hseDocumentFormSchema>;

export const hseNewVersionSchema = z.object({
  changeLog: z.string().trim().min(3, 'Contá qué cambió en esta versión').max(1000, 'Máximo 1000 caracteres'),
  expiresAt: optionalDay,
});
export type HseNewVersionValues = z.infer<typeof hseNewVersionSchema>;

export const hseDocumentTypeSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
});
export type HseDocumentTypeValues = z.infer<typeof hseDocumentTypeSchema>;

/** Respuesta del empleado desde el portal. Aceptar exige la contraseña; rechazar, un motivo. */
export const hseAcknowledgeSchema = z.discriminatedUnion('decision', [
  z.object({
    ackId: z.string().uuid(),
    decision: z.literal('accept'),
    password: z.string().min(1, 'Ingresá tu contraseña'),
  }),
  z.object({
    ackId: z.string().uuid(),
    decision: z.literal('reject'),
    reason: z.string().trim().min(5, 'Contá brevemente el motivo').max(500, 'Máximo 500 caracteres'),
  }),
]);
export type HseAcknowledgeInput = z.infer<typeof hseAcknowledgeSchema>;
