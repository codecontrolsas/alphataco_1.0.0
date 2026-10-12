import type { QueryClient } from '@tanstack/react-query';
import { invalidateTreasury } from '@/features/Treasury/lib/invalidate';
import { PURCHASES_QUERY_KEYS } from './query-keys';

/**
 * Despues de mutar algo de Compras se invalidan todas las tablas: una OC cambia el avance de sus
 * solicitudes, una cotizacion genera OC, etc. (las tablas corren en client-side mode: un
 * `router.refresh()` solo no las actualiza). Tambien las de Tesoreria: pagar o anular una orden de
 * pago mueve el saldo de las cuentas.
 */
export function invalidatePurchases(queryClient: QueryClient): void {
  for (const queryKey of [
    PURCHASES_QUERY_KEYS.requests,
    PURCHASES_QUERY_KEYS.quotes,
    PURCHASES_QUERY_KEYS.orders,
    PURCHASES_QUERY_KEYS.receipts,
    PURCHASES_QUERY_KEYS.invoices,
    PURCHASES_QUERY_KEYS.vatBook,
    PURCHASES_QUERY_KEYS.payments,
    PURCHASES_QUERY_KEYS.dueInvoices,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
  invalidateTreasury(queryClient);
}
