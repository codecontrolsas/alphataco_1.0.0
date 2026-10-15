'use client';

import { useQuery } from '@tanstack/react-query';
import { getCustomerEquipmentsByCustomer } from '../../actions/customer-equipment.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../../hooks/useTablePreferences';
import { customerTabKey } from '../../lib/query-keys';
import { CustomerEquipmentFormDialog } from '../equipos/CustomerEquipmentFormDialog';
import CustomerEquipmentTable from '../equipos/customerEquipmentTable';
import { QueryErrorState } from './QueryErrorState';

interface CustomerOwnEquipmentTabProps {
  customer: { id: string; name: string };
  canCreate: boolean;
  canUpdate: boolean;
}

const TABLE_ID = 'customer-own-equipment';

/**
 * Pestaña "Equipos del cliente" de la ficha: el CRUD de `equipos_clientes`.
 *
 * Son los equipos que APORTA el cliente (su perforador, su work over), y son los que después se
 * eligen al cargar una línea del parte diario. No confundir con la pestaña "Equipos afectados",
 * que son equipos DE LA EMPRESA asignados a este cliente (`contractor_equipment`).
 */
export function CustomerOwnEquipmentTab({ customer, canCreate, canUpdate }: CustomerOwnEquipmentTabProps) {
  const equipmentQuery = useQuery({
    queryKey: customerTabKey(customer.id, 'own-equipment'),
    queryFn: () => getCustomerEquipmentsByCustomer(customer.id),
    staleTime: 60 * 1000,
  });
  const preferences = useTablePreferences(TABLE_ID);

  let content: React.ReactNode;
  if (equipmentQuery.isError) {
    content = (
      <QueryErrorState
        title="No se pudieron cargar los equipos del cliente"
        isRetrying={equipmentQuery.isFetching}
        onRetry={() => equipmentQuery.refetch()}
      />
    );
  } else if (equipmentQuery.isPending || preferences.isPending) {
    content = <CustomersTableSkeleton rows={4} />;
  } else {
    content = (
      <CustomerEquipmentTable
        customerEquipments={equipmentQuery.data}
        customerId={customer.id}
        canEdit={canUpdate}
        initialColumnVisibility={preferences.data?.columnVisibility ?? {}}
        initialFilterVisibility={preferences.data?.filterVisibility ?? {}}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Equipos del cliente</h2>
        {canCreate ? <CustomerEquipmentFormDialog customerId={customer.id} triggerLabel="Nuevo equipo" /> : null}
      </div>
      {content}
    </div>
  );
}
