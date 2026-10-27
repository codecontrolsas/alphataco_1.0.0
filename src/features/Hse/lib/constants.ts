/** Constantes de HSE. Módulo SIN directiva: lo usan el servidor, el cliente y el portal. */

export const HSE_FILES_BUCKET = 'hse-files';

/** Tope del PDF de un documento HSE (el límite de las Server Actions es 10 MB: `next.config.js`). */
export const HSE_PDF_MAX_BYTES = 9 * 1024 * 1024;

export const HSE_DOCUMENT_STATUS_LABELS = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Retirado',
} as const;
export type HseDocumentStatus = keyof typeof HSE_DOCUMENT_STATUS_LABELS;

export const HSE_ACK_STATUS_LABELS = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
} as const;
export type HseAckStatus = keyof typeof HSE_ACK_STATUS_LABELS;

export const HSE_TARGET_KIND_LABELS = {
  all: 'Todo el personal',
  position: 'Puesto',
  sector: 'Sector',
  employee: 'Empleado',
} as const;
export type HseTargetKind = keyof typeof HSE_TARGET_KIND_LABELS;

export const HSE_TRAINING_STATUS_LABELS = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Retirada',
} as const;
export type HseTrainingStatus = keyof typeof HSE_TRAINING_STATUS_LABELS;

export const HSE_TRAINING_KIND_LABELS = {
  induction: 'Inducción',
  refresher: 'Refuerzo periódico',
  specific: 'Específica del puesto',
  other: 'Otra',
} as const;
export type HseTrainingKind = keyof typeof HSE_TRAINING_KIND_LABELS;

/**
 * Situación de un empleado frente a una capacitación. `expired` no se guarda: es una aprobada cuya vigencia
 * (`valid_until`) ya pasó (hoy en hora argentina) y tiene que volver a rendir.
 */
export const HSE_ASSIGNMENT_STATUS_LABELS = {
  pending: 'Pendiente',
  in_progress: 'Rindiendo',
  passed: 'Aprobada',
  failed: 'Sin intentos',
  expired: 'Vencida',
} as const;
export type HseAssignmentStatus = keyof typeof HSE_ASSIGNMENT_STATUS_LABELS;

export const HSE_ATTEMPT_STATUS_LABELS = {
  in_progress: 'En curso',
  submitted: 'Enviado',
  expired: 'Cerrado por tiempo',
} as const;
export type HseAttemptStatus = keyof typeof HSE_ATTEMPT_STATUS_LABELS;

/** Límites del examen (los mismos CHECK de la base). */
export const HSE_EXAM_LIMITS = {
  minOptions: 2,
  maxOptions: 6,
  maxQuestions: 100,
  maxAttempts: 20,
  maxTimeLimitMinutes: 600,
  maxValidityMonths: 120,
  maxPoints: 100,
} as const;

/** Query keys de React Query del módulo: se invalidan juntas tras cada mutación. */
export const HSE_QUERY_KEYS = {
  all: ['hse'] as const,
  documents: ['hse', 'documents'] as const,
  compliance: ['hse', 'compliance'] as const,
  types: ['hse', 'types'] as const,
  trainings: ['hse', 'trainings'] as const,
  trainingCompliance: ['hse', 'training-compliance'] as const,
};
