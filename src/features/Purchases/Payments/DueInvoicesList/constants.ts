import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de vencimientos. */
export const DUE_INVOICES_TABLE_ID = 'due-invoices';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const DUE_INVOICES_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.dueInvoices, 'attention'] as const;

/** Columnas ocultas por defecto (el tipo de comprobante ya se ve bajo el número). */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['cbte_type', 'issue_date'];

/** Tipos de comprobante a pagar: facturas, ND y NC habilitadas del catalogo. */
export const DUE_CBTE_TYPE_IDS = [1, 2, 3, 6, 7, 8, 11, 12, 13] as const;

export const CHECK_DEBT_TYPE_LABEL = 'Cheque rechazado';

export const NO_ORDER_LABEL = 'Sin orden';
export const NO_DUE_DATE_LABEL = 'Sin vencimiento';

export const DAYS_VALUES = ['overdue', 'upcoming', 'none'] as const;

export const DAYS_FILTER_LABELS = {
  overdue: 'Vencido',
  upcoming: 'A vencer',
  none: NO_DUE_DATE_LABEL,
} as const;

/** Tope de filas del export. */
export const DUE_INVOICES_EXPORT_MAX_ROWS = 10_000;
