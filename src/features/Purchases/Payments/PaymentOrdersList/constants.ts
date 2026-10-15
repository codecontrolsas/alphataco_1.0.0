import type { payment_method } from '@/generated/prisma/enums';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

/** Id de preferencias y namespace de URL de la tabla de órdenes de pago. */
export const PAYMENT_ORDERS_TABLE_ID = 'payment-orders';

/** Clave de la banda de atención: cuelga de la de la tabla, así `invalidatePurchases` también la refresca. */
export const PAYMENT_ORDERS_ATTENTION_QUERY_KEY = [...PURCHASES_QUERY_KEYS.payments, 'attention'] as const;

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['credits_total', 'advance_total', 'created_at'];

export const PAYMENT_METHOD_LABELS: Record<payment_method, string> = {
  TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  ECHECK: 'E-cheq',
  CASH: 'Efectivo',
  THIRD_PARTY_CHECK: 'Cheque de tercero',
};

export const NO_PAYMENT_LABEL = 'Sin pagar';

/** Tope de filas del export. */
export const PAYMENT_ORDERS_EXPORT_MAX_ROWS = 10_000;
