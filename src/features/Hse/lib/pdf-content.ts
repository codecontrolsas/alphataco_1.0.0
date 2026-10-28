import { z } from 'zod';

/**
 * Forma del contenido CONGELADO de una constancia (`hse_training_certificates.content`) y de un acta cerrada
 * (`hse_training_records.content`). Lo arma la base (`hse_sign_certificate`, `hse_close_training_record`) y es la fuente
 * de verdad de los PDF: se valida acá en vez de confiar en la forma del JSON. Módulo SIN directiva (servidor y
 * cliente).
 */

const instructorSchema = z.object({
  kind: z.enum(['internal', 'external']),
  fullName: z.string(),
  license: z.string().nullable(),
  roleTitle: z.string().nullable(),
});

const companySchema = z.object({ id: z.string(), name: z.string(), cuit: z.string() });

const trainingSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['induction', 'refresher', 'specific', 'other']),
  passingScore: z.number(),
  validityMonths: z.number().nullable(),
});

const modalitySchema = z.enum(['in_person', 'virtual', 'mixed', 'online']);

export const certificateContentSchema = z.object({
  schema: z.literal('hse.training_certificate.v1'),
  certificateId: z.string(),
  company: companySchema,
  employee: z.object({
    id: z.string(),
    fullName: z.string(),
    file: z.string().nullable(),
    cuil: z.string().nullable(),
    position: z.string().nullable(),
    sector: z.string().nullable(),
  }),
  training: trainingSchema,
  result: z.object({
    attemptId: z.string(),
    attemptNumber: z.number(),
    scorePoints: z.number().nullable(),
    maxPoints: z.number(),
    scorePercent: z.coerce.number(),
    passedAt: z.string(),
    validUntil: z.string().nullable(),
  }),
  record: z
    .object({
      id: z.string(),
      number: z.number(),
      heldOn: z.string(),
      modality: modalitySchema,
      location: z.string().nullable(),
    })
    .nullable(),
  instructors: z.array(instructorSchema),
  signature: z.object({
    method: z.literal('password'),
    signedAt: z.string(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
  }),
});
export type CertificateContent = z.infer<typeof certificateContentSchema>;

const attendeeResultSchema = z.object({
  status: z.enum(['not_assigned', 'pending', 'in_progress', 'passed', 'failed', 'expired']),
  scorePercent: z.coerce.number().nullable().optional(),
  attempts: z.number().optional(),
  passedAt: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
});

export const recordContentSchema = z.object({
  schema: z.literal('hse.training_record.v1'),
  recordId: z.string(),
  number: z.number(),
  company: companySchema,
  training: trainingSchema,
  heldOn: z.string(),
  modality: modalitySchema,
  location: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  topics: z.string(),
  observations: z.string().nullable(),
  instructors: z.array(instructorSchema.extend({ employeeId: z.string().nullable() })),
  attendees: z.array(
    z.object({
      employeeId: z.string(),
      fullName: z.string(),
      file: z.string().nullable(),
      cuil: z.string().nullable(),
      position: z.string().nullable(),
      attended: z.boolean(),
      result: attendeeResultSchema,
      certificate: z.object({ id: z.string(), signedAt: z.string(), sha256: z.string() }).nullable(),
    })
  ),
  closedAt: z.string(),
  closedBy: z.object({ profileId: z.string().nullable(), name: z.string().nullable() }),
});
export type RecordContent = z.infer<typeof recordContentSchema>;

export const HSE_RECORD_MODALITY_LABELS = {
  in_person: 'Presencial',
  virtual: 'Virtual (en vivo)',
  mixed: 'Mixta',
  online: 'En línea (portal)',
} as const;
export type HseRecordModality = keyof typeof HSE_RECORD_MODALITY_LABELS;

export const HSE_RECORD_STATUS_LABELS = {
  draft: 'Borrador',
  closed: 'Cerrada',
  voided: 'Anulada',
} as const;
export type HseRecordStatus = keyof typeof HSE_RECORD_STATUS_LABELS;

export const HSE_INSTRUCTOR_KIND_LABELS = {
  internal: 'Interno',
  external: 'Externo',
} as const;

/** Resultado de un asistente en el acta (incluye "sin asignar": el acta puede listar a alguien que no la tiene). */
export const HSE_ATTENDEE_RESULT_LABELS = {
  not_assigned: 'Sin asignar',
  pending: 'Pendiente',
  in_progress: 'Rindiendo',
  passed: 'Aprobada',
  failed: 'Sin intentos',
  expired: 'Vencida',
} as const;
