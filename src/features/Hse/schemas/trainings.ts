import { z } from 'zod';
import { HSE_EXAM_LIMITS, HSE_TRAINING_KIND_LABELS, type HseTrainingKind } from '../lib/constants';
import { hseTargetSchema } from './documents';

/**
 * Schemas de las capacitaciones HSE. Módulo SIN directiva: los usan los formularios (cliente) y las actions (servidor).
 * Ver la Learned Correction "Schemas Zod compartidos server/client".
 */

const KIND_VALUES = Object.keys(HSE_TRAINING_KIND_LABELS) as [HseTrainingKind, ...HseTrainingKind[]];

/** Entero opcional que llega como texto del input ('' = sin valor). */
const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), message);

export const hseTrainingFormSchema = z.object({
  title: z.string().trim().min(3, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  description: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional(),
  kind: z.enum(KIND_VALUES),
  /** Porcentaje de puntos para aprobar. */
  passingScore: z.coerce.number().int('Número entero').min(1, 'Entre 1 y 100').max(100, 'Entre 1 y 100'),
  maxAttempts: z.coerce
    .number()
    .int('Número entero')
    .min(1, 'Al menos 1 intento')
    .max(HSE_EXAM_LIMITS.maxAttempts, `Hasta ${HSE_EXAM_LIMITS.maxAttempts} intentos`),
  /** Minutos para responder ('' = sin límite). */
  timeLimitMinutes: optionalInt(
    1,
    HSE_EXAM_LIMITS.maxTimeLimitMinutes,
    `Entre 1 y ${HSE_EXAM_LIMITS.maxTimeLimitMinutes} minutos`
  ),
  shuffleQuestions: z.boolean(),
  /** Meses de vigencia de la aprobación ('' = no vence). */
  validityMonths: optionalInt(
    1,
    HSE_EXAM_LIMITS.maxValidityMonths,
    `Entre 1 y ${HSE_EXAM_LIMITS.maxValidityMonths} meses`
  ),
  targets: z.array(hseTargetSchema).min(1, 'Elegí al menos un destinatario'),
});
export type HseTrainingFormValues = z.infer<typeof hseTrainingFormSchema>;
export type HseTrainingFormInput = z.input<typeof hseTrainingFormSchema>;

export const hseMaterialLinkSchema = z.object({
  title: z.string().trim().min(2, 'Poné un título').max(200, 'Máximo 200 caracteres'),
  url: z
    .string()
    .trim()
    .max(2000, 'El enlace es muy largo')
    .url('El enlace no es válido')
    .refine((v) => v.startsWith('https://'), 'El enlace tiene que empezar con https://'),
  isRequired: z.boolean(),
});
export type HseMaterialLinkValues = z.infer<typeof hseMaterialLinkSchema>;

export const hseMaterialFileMetaSchema = z.object({
  title: z.string().trim().min(2, 'Poné un título').max(200, 'Máximo 200 caracteres'),
  isRequired: z.boolean(),
});
export type HseMaterialFileMetaValues = z.infer<typeof hseMaterialFileMetaSchema>;

/**
 * Pregunta de opción única con su clave: `correctIndex` es la posición de la opción correcta. La clave viaja SOLO del
 * dashboard al servidor (con permiso); nunca de vuelta al portal.
 */
export const hseQuestionSchema = z
  .object({
    prompt: z.string().trim().min(3, 'Escribí la pregunta').max(1000, 'Máximo 1000 caracteres'),
    points: z.coerce
      .number()
      .int('Número entero')
      .min(1, 'Al menos 1 punto')
      .max(HSE_EXAM_LIMITS.maxPoints, `Hasta ${HSE_EXAM_LIMITS.maxPoints} puntos`),
    options: z
      .array(z.object({ label: z.string().trim().min(1, 'Completá la opción').max(500, 'Máximo 500 caracteres') }))
      .min(HSE_EXAM_LIMITS.minOptions, `Al menos ${HSE_EXAM_LIMITS.minOptions} opciones`)
      .max(HSE_EXAM_LIMITS.maxOptions, `Hasta ${HSE_EXAM_LIMITS.maxOptions} opciones`),
    correctIndex: z.coerce.number().int().min(0, 'Marcá la opción correcta'),
  })
  .refine((q) => q.correctIndex < q.options.length, { message: 'Marcá la opción correcta', path: ['correctIndex'] })
  .refine((q) => new Set(q.options.map((o) => o.label.toLowerCase())).size === q.options.length, {
    message: 'Hay opciones repetidas',
    path: ['options'],
  });
export type HseQuestionValues = z.infer<typeof hseQuestionSchema>;
export type HseQuestionInput = z.input<typeof hseQuestionSchema>;

// ── Portal ──────────────────────────────────────────────────────────────────────────────────

export const hseStartAttemptSchema = z.object({ trainingId: z.string().uuid() });
export const hseMarkMaterialReadSchema = z.object({ materialId: z.string().uuid() });
/** Respuesta a una pregunta: SOLO la opción elegida. El servidor decide si es correcta. */
export const hseSaveAnswerSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  optionId: z.string().uuid(),
});
export type HseSaveAnswerInput = z.infer<typeof hseSaveAnswerSchema>;
export const hseAttemptIdSchema = z.object({ attemptId: z.string().uuid() });
