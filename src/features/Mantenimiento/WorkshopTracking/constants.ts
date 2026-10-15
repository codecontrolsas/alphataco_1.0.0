/**
 * Identificadores de la tabla de Seguimiento (sin directiva: los comparten el servidor y el cliente).
 *
 * `PARAM_NAMESPACE` es el prefijo de los parámetros de la URL (`workshop-tracking__status`…) y NO cambia, así
 * los links guardados siguen andando. `TABLE_ID` es la clave de preferencias de columnas y filtros: lleva
 * sufijo `-v2` porque las columnas cambiaron y las preferencias viejas ocultarían las nuevas.
 */
export const WORKSHOP_TRACKING_PARAM_NAMESPACE = 'workshop-tracking';
export const WORKSHOP_TRACKING_TABLE_ID = 'workshop-tracking-v2';
