'use client';

import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CUSTOMERS_LIST_QUERY_KEY, customerKey } from '../../lib/query-keys';
import type { CustomerRow } from '../../lib/serializers';
import { CustomerForm } from '../CustomerForm';

interface CustomerDetailTabProps {
  customer: CustomerRow;
  canUpdate: boolean;
}

/** Pestaña "Detalle": datos del cliente con edición habilitable. */
export function CustomerDetailTab({ customer, canUpdate }: CustomerDetailTabProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">Información del Cliente</h3>
        {canUpdate ? (
          <Button type="button" variant="brand" onClick={() => setIsEditing((prev) => !prev)}>
            {isEditing ? 'Deshabilitar edición' : 'Habilitar edición'}
          </Button>
        ) : null}
      </div>
      {/* Se remonta al cambiar de modo o cuando se refrescan los datos del cliente. */}
      <CustomerForm
        key={`${isEditing ? 'edit' : 'view'}-${JSON.stringify(customer)}`}
        customer={customer}
        readOnly={!isEditing}
        onSuccess={() => {
          setIsEditing(false);
          // La ficha y el listado leen por React Query: sin invalidar siguen mostrando los datos viejos.
          queryClient.invalidateQueries({ queryKey: customerKey(customer.id) });
          queryClient.invalidateQueries({ queryKey: CUSTOMERS_LIST_QUERY_KEY });
        }}
      />
    </div>
  );
}
