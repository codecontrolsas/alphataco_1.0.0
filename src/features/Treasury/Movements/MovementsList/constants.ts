/** Constantes de la tabla de movimientos. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const MOVEMENT_STATE_LABELS = {
  ACTIVE: 'Vigente',
  CANCELLED: 'Anulado',
  RECONCILED: 'Conciliado',
} as const;

/** Texto que muestra la tabla para una operación de cheques sin número (la carga inicial). */
export const OPENING_OPERATION_LABEL = 'Carga inicial';
