import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de proveedores. */
export const SUPPLIERS_TABLE_ID = 'suppliers';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const SUPPLIERS_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.suppliers, 'attention'] as const;

/** Lista filtrada a los proveedores activos con documentación vencida (misma definición que el contador de la banda). */
export const EXPIRED_DOCUMENTS_HREF = `/dashboard/purchases?tab=proveedores&${SUPPLIERS_TABLE_ID}__documents=EXPIRED&${SUPPLIERS_TABLE_ID}__is_active=true`;

/** Tope de filas del export. */
export const SUPPLIERS_EXPORT_MAX_ROWS = 10_000;

/** Largo de un CUIT: con todos los dígitos la búsqueda es por igualdad exacta. */
export const CUIT_LENGTH = 11;
