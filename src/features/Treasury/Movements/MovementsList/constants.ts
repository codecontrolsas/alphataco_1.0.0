/** Constantes de la tabla de movimientos. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const MOVEMENT_STATE_LABELS = {
  ACTIVE: 'Vigente',
  CANCELLED: 'Anulado',
} as const;

export type MovementState = keyof typeof MOVEMENT_STATE_LABELS;
