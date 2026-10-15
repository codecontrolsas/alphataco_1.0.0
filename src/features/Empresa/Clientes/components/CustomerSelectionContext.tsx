'use client';

import { createContext, useContext } from 'react';

interface CustomerSelection {
  /** Abre la ficha del cliente elegido en el listado. */
  selectCustomer: (customerId: string) => void;
}

const CustomerSelectionContext = createContext<CustomerSelection | null>(null);

export const CustomerSelectionProvider = CustomerSelectionContext.Provider;

/** Selección del cliente desde las celdas del listado (el listado vive dentro de `CustomersPanel`). */
export function useCustomerSelection(): CustomerSelection {
  const context = useContext(CustomerSelectionContext);
  if (!context) throw new Error('useCustomerSelection debe usarse dentro de CustomersPanel');
  return context;
}
