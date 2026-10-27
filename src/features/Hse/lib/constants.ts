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

/** Query keys de React Query del módulo: se invalidan juntas tras cada mutación. */
export const HSE_QUERY_KEYS = {
  all: ['hse'] as const,
  documents: ['hse', 'documents'] as const,
  compliance: ['hse', 'compliance'] as const,
  types: ['hse', 'types'] as const,
};
