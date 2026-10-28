import { z } from 'zod';
import { HSE_RECORD_MODALITY_LABELS, type HseRecordModality } from '../lib/pdf-content';

/**
 * Schemas del acta, los capacitadores y la constancia firmada. Módulo SIN directiva: los usan los formularios
 * (cliente) y las acciones (servidor).
 */

const MODALITY_VALUES = Object.keys(HSE_RECORD_MODALITY_LABELS) as [HseRecordModality, ...HseRecordModality[]];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Datos del acta (se editan mientras está en borrador). La duración llega como texto del input ('' = sin dato). */
export const hseRecordFormSchema = z.object({
  heldOn: z.string().regex(ISO_DAY, 'Elegí la fecha del dictado'),
  modality: z.enum(MODALITY_VALUES),
  location: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  durationMinutes: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 6000), 'Entre 1 y 6000 minutos'),
  topics: z.string().trim().min(3, 'Escribí el temario').max(4000, 'Máximo 4000 caracteres'),
  observations: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional(),
});
export type HseRecordFormValues = z.infer<typeof hseRecordFormSchema>;

export const hseRecordCreateSchema = hseRecordFormSchema.extend({
  trainingId: z.string().uuid('Elegí la capacitación'),
});
export type HseRecordCreateValues = z.infer<typeof hseRecordCreateSchema>;

/** Capacitador: interno (un legajo de la empresa) o externo (nombre y, si tiene, matrícula). */
export const hseInstructorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('internal'),
    employeeId: z.string().uuid('Elegí el empleado'),
    roleTitle: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
    license: z.string().trim().max(60, 'Máximo 60 caracteres').optional(),
  }),
  z.object({
    kind: z.literal('external'),
    fullName: z.string().trim().min(3, 'Escribí el nombre').max(160, 'Máximo 160 caracteres'),
    roleTitle: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
    license: z.string().trim().max(60, 'Máximo 60 caracteres').optional(),
  }),
]);
export type HseInstructorValues = z.infer<typeof hseInstructorSchema>;

/** Anulación (acta o constancia): siempre con motivo. */
export const hseVoidSchema = z.object({
  reason: z.string().trim().min(5, 'Explicá el motivo (al menos 5 caracteres)').max(500, 'Máximo 500 caracteres'),
});
export type HseVoidValues = z.infer<typeof hseVoidSchema>;

// ── Portal ──────────────────────────────────────────────────────────────────────────────────

/** Firma de la constancia: el intento aprobado y la contraseña del empleado (se verifica en la misma acción). */
export const hseSignCertificateSchema = z.object({
  attemptId: z.string().uuid(),
  password: z.string().min(1, 'Ingresá tu contraseña').max(200),
});
export type HseSignCertificateValues = z.infer<typeof hseSignCertificateSchema>;
