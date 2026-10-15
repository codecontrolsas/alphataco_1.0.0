'use client';

import { getProvinces } from '@/shared/actions/countries.server';
import { useQuery } from '@tanstack/react-query';
import { getAreasByCustomer } from '../../actions/areas.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../../hooks/useTablePreferences';
import { customerTabKey } from '../../lib/query-keys';
import { AreaFormDialog } from '../area_clientes/AreaFormDialog';
import AreaTable from '../area_clientes/areaTable';
import { QueryErrorState } from './QueryErrorState';

interface CustomerAreasTabProps {
  customer: { id: string; name: string };
  canCreate: boolean;
  canUpdate: boolean;
}

const TABLE_ID = 'customer-areas';

/**
 * Pestaña "Áreas" de la ficha del cliente: pide SUS datos al abrirse (las áreas de este cliente), no las de
 * toda la empresa.
 *
 * Un área pertenece a un cliente (`areas_cliente.customer_id`) y acá el cliente ya está fijado por la
 * ficha, así que el formulario no lo pide: lo recibe. El alta y la edición van en un diálogo.
 */
export function CustomerAreasTab({ customer, canCreate, canUpdate }: CustomerAreasTabProps) {
  const areasQuery = useQuery({
    queryKey: customerTabKey(customer.id, 'areas'),
    queryFn: () => getAreasByCustomer(customer.id),
    staleTime: 60 * 1000,
  });
  const provincesQuery = useQuery({
    queryKey: ['provinces'],
    queryFn: () => getProvinces(),
    staleTime: Infinity,
  });
  const preferences = useTablePreferences(TABLE_ID);

  const provinces = provincesQuery.data ?? [];

  let content: React.ReactNode;
  if (areasQuery.isError || provincesQuery.isError) {
    content = (
      <QueryErrorState
        title="No se pudieron cargar las áreas del cliente"
        isRetrying={areasQuery.isFetching || provincesQuery.isFetching}
        onRetry={() => {
          if (areasQuery.isError) areasQuery.refetch();
          if (provincesQuery.isError) provincesQuery.refetch();
        }}
      />
    );
  } else if (areasQuery.isPending || provincesQuery.isPending || preferences.isPending) {
    content = <CustomersTableSkeleton rows={4} />;
  } else {
    content = (
      <AreaTable
        areas={areasQuery.data}
        customerId={customer.id}
        provinces={provinces}
        canEdit={canUpdate}
        initialColumnVisibility={preferences.data?.columnVisibility ?? {}}
        initialFilterVisibility={preferences.data?.filterVisibility ?? {}}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Áreas</h2>
        {canCreate && !provincesQuery.isError ? (
          <AreaFormDialog customerId={customer.id} provinces={provinces} triggerLabel="Nueva área" />
        ) : null}
      </div>
      {content}
    </div>
  );
}
