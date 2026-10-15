import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de órdenes de compra. */
export const ORDERS_TABLE_ID = 'purchase-orders';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const ORDERS_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.orders, 'attention'] as const;
