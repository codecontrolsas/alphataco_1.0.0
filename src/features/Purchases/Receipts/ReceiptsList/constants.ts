import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de recepciones de compra. */
export const RECEIPTS_TABLE_ID = 'purchase-receipts';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const RECEIPTS_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.receipts, 'attention'] as const;

/** Valores del filtro de estado (derivado de `cancelled_at`). */
export const RECEIPT_STATUS_ACTIVE = 'active';
export const RECEIPT_STATUS_CANCELLED = 'cancelled';

/** Lista de órdenes filtrada a las pendientes de recibir (misma definición que el contador de la sub-navegación). */
export const PENDING_ORDERS_HREF =
  '/dashboard/purchases?tab=ordenes&purchase-orders__status=SENT,PARTIALLY_RECEIVED';
