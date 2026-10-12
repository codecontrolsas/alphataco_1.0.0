/** Constantes de la tabla de recibos. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const RECEIPT_STATUS_VALUES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export const DRAFT_NUMBER_LABEL = 'Borrador';
export const SENT_LABELS = { YES: 'Sí', NO: 'No' } as const;
export type SentValue = keyof typeof SENT_LABELS;
