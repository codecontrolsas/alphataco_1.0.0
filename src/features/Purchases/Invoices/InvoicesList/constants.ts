import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de facturas de proveedor. */
export const INVOICES_TABLE_ID = 'supplier-invoices';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const INVOICES_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.invoices, 'attention'] as const;

/** Tipos de comprobante que se cargan en la etapa 4 (los habilitados del catálogo). */
export const INVOICE_CBTE_TYPE_IDS = [1, 2, 3, 6, 7, 8, 11, 12, 13] as const;

export const NO_ARCA_CHECK_LABEL = 'Sin constatar';
export const NO_ORDER_LABEL = 'Sin OC';

/** Columnas ocultas por defecto (el tipo de comprobante ya se ve bajo el número). */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['cbte_type', 'supplier_cuit', 'vat_period', 'due_date', 'created_at'];
