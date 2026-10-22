'use client';

import { Card } from '@/components/ui/card';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import { getServiceItemsByContract, type ServiceItemRow } from '../../actions/service-items.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { QueryErrorState } from '../CustomerDetail/QueryErrorState';
import { ServiceItemsDataTable } from './ServiceItemsDataTable';
import ServiceItemsForm from './ServiceItemsForm';

interface ServiceItemsTableProps {
  measureUnits: MeasureUnitRow[];
  customerServiceId: string;
}

/** Items de un contrato: formulario de alta/edición (a un lado en pantallas anchas, arriba en el celular) + tabla. */
export default function ServiceItemsTable({ measureUnits, customerServiceId }: ServiceItemsTableProps) {
  const [editingItem, setEditingItem] = useState<ServiceItemRow | null>(null);
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ['service-items', customerServiceId],
    queryFn: () => getServiceItemsByContract(customerServiceId),
    enabled: !!customerServiceId,
    staleTime: 60 * 1000,
  });

  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('comercial', 'items-contrato', 'update');
  const canViewPrices = hasPermission('comercial', 'items-contrato', 'view_prices');
  const canUpdatePrices = hasPermission('comercial', 'items-contrato', 'update_prices');
  const canCreateOrUpdate = hasPermission('comercial', 'items-contrato', 'create') || canUpdate;
  const permissions = useMemo(
    () => ({ canUpdate, canViewPrices, canUpdatePrices }),
    [canUpdate, canViewPrices, canUpdatePrices]
  );

  // Un cambio en un ítem (alta, edición, baja, precio) se ve también en la ficha del cliente.
  const refreshItems = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['service-items', customerServiceId] });
    queryClient.invalidateQueries({ queryKey: ['preparte-service-items', customerServiceId] });
    queryClient.invalidateQueries({ queryKey: ['comercial', 'customer'] });
  }, [queryClient, customerServiceId]);

  const handleSaved = () => {
    setEditingItem(null);
    refreshItems();
  };

  let table: React.ReactNode;
  if (itemsQuery.isError) {
    table = (
      <QueryErrorState
        title="No se pudieron cargar los ítems del contrato"
        isRetrying={itemsQuery.isFetching}
        onRetry={() => itemsQuery.refetch()}
      />
    );
  } else if (itemsQuery.isPending) {
    table = <CustomersTableSkeleton rows={4} />;
  } else {
    table = (
      <ServiceItemsDataTable
        items={itemsQuery.data}
        permissions={permissions}
        onEdit={setEditingItem}
        onPriceSaved={refreshItems}
      />
    );
  }

  return (
    <div className={canCreateOrUpdate ? 'grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]' : 'grid gap-4'}>
      {canCreateOrUpdate && (
        <Card className="self-start">
          <ServiceItemsForm
            key={editingItem?.id ?? 'new'}
            measureUnits={measureUnits}
            customerServiceId={customerServiceId}
            editingItem={editingItem}
            onCancel={() => setEditingItem(null)}
            onSaved={handleSaved}
          />
        </Card>
      )}
      <Card className="min-w-0">
        <div className="flex flex-col p-4">{table}</div>
      </Card>
    </div>
  );
}
