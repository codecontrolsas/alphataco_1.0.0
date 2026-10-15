/**
 * Claves de React Query de Clientes. Todas las pestañas de la ficha cuelgan de
 * `['comercial', 'customer', id, <pestaña>]`: invalidar `customerKey(id)` refresca la ficha entera.
 */
export const CUSTOMERS_LIST_QUERY_KEY = ['comercial', 'customers-list'] as const;

export type CustomerTab =
  | 'detail'
  | 'summary'
  | 'employees'
  | 'equipment'
  | 'own-equipment'
  | 'areas'
  | 'sectors'
  | 'contracts'
  | 'assignable-employees'
  | 'assignable-equipment';

export function customerKey(customerId: string) {
  return ['comercial', 'customer', customerId] as const;
}

export function customerTabKey(customerId: string, tab: CustomerTab) {
  return ['comercial', 'customer', customerId, tab] as const;
}
