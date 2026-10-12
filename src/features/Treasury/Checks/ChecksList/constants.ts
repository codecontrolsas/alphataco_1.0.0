/** Constantes de la tabla de cheques. Módulo SIN directiva: lo usan el servidor y el cliente. */

export const CHECK_STATUS_VALUES = ['IN_PORTFOLIO', 'DEPOSITED', 'ENDORSED', 'DISCOUNTED', 'REJECTED', 'CANCELLED'] as const;
export const CHECK_KIND_VALUES = ['PHYSICAL', 'ECHECK'] as const;

/** Estado con el que arranca la tabla cuando la URL no trae un filtro de estado. */
export const DEFAULT_STATUS_FILTER = 'IN_PORTFOLIO';
