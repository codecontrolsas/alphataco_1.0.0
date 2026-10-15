import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de solicitudes de compra. */
export const REQUESTS_TABLE_ID = 'purchase-requests';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const REQUESTS_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.requests, 'attention'] as const;
