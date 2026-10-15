import { WAREHOUSE_QUERY_KEYS } from '@/features/Warehouses/lib/query-keys';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Registrar o anular una recepción mueve stock en Almacenes (entrada o su anulación): las tablas de Almacenes
 * corren en client-side mode, así que hay que invalidarlas además de las de Compras (`router.refresh()` solo
 * revalida la ruta). Incluye el kardex, los materiales (stock/costo), la disponibilidad por depósito y el aviso de
 * atención de la sub-navegación.
 */
export function invalidateWarehouseAfterReceipt(queryClient: QueryClient): void {
  for (const queryKey of [
    WAREHOUSE_QUERY_KEYS.stock,
    WAREHOUSE_QUERY_KEYS.movements,
    WAREHOUSE_QUERY_KEYS.materials,
    WAREHOUSE_QUERY_KEYS.availability,
    WAREHOUSE_QUERY_KEYS.stockAttention,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
