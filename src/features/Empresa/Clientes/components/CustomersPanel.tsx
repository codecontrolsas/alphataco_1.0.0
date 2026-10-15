'use client';

import { useCallback, useMemo, useState } from 'react';
import { CustomerDetail, type CustomerDetailPreferences } from './CustomerDetail/CustomerDetail';
import { CustomerSelectionProvider } from './CustomerSelectionContext';

interface CustomersPanelProps {
  /** El listado, renderizado en el servidor (`CustomersList`). */
  children: React.ReactNode;
  permissionsMap: Record<string, boolean>;
  contractsPreferences: CustomerDetailPreferences;
}

/**
 * Pestaña "Clientes" de Comercial: listado y, al elegir una fila, la ficha del cliente.
 * El listado llega del servidor; la ficha pide sus datos con React Query al abrirse.
 */
export function CustomersPanel({ children, permissionsMap, contractsPreferences }: CustomersPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectCustomer = useCallback((customerId: string) => setSelectedId(customerId), []);
  const selection = useMemo(() => ({ selectCustomer }), [selectCustomer]);

  if (selectedId) {
    return (
      <CustomerDetail
        customerId={selectedId}
        permissionsMap={permissionsMap}
        contractsPreferences={contractsPreferences}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return <CustomerSelectionProvider value={selection}>{children}</CustomerSelectionProvider>;
}
