/** Constantes de la tabla de cheques propios. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const OWN_CHECK_STATUS_VALUES = ['ISSUED', 'DEBITED', 'REJECTED', 'CANCELLED'] as const;
export const OWN_CHECK_KIND_VALUES = ['PHYSICAL', 'ECHECK'] as const;

/** Estado con el que arranca la tabla cuando la URL no trae un filtro de estado. */
export const DEFAULT_STATUS_FILTER = 'ISSUED';

export const OWN_CHECKS_TABLE_ID = 'treasury-own-checks';
