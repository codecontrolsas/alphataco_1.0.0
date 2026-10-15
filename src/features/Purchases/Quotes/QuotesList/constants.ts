/** Id de preferencias y namespace de URL de la tabla de pedidos de cotizacion. */
export const QUOTES_TABLE_ID = 'purchase-quotes';

/** Clave de React Query de la banda de atencion (cuelga de la de la lista: se invalida junto con ella). */
export const QUOTES_ATTENTION_QUERY_KEY = ['purchase-quotes', 'attention'] as const;

/** Estado de los pedidos enviados que esperan respuesta, tal cual se escribe en el filtro de Estado. */
export const AWAITING_RESPONSE_FILTER = 'SENT';
