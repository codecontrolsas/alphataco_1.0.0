'use client';

import { useQuery } from '@tanstack/react-query';
import { getSectorsByCustomer } from '../../actions/sectors.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../../hooks/useTablePreferences';
import { customerTabKey } from '../../lib/query-keys';
import { SectorFormDialog } from '../sector_clientes/SectorFormDialog';
import SectorTable from '../sector_clientes/sectorTable';
import { QueryErrorState } from './QueryErrorState';

interface CustomerSectorsTabProps {
  customer: { id: string; name: string };
  canCreate: boolean;
  canUpdate: boolean;
}

const TABLE_ID = 'customer-sectors';

/**
 * Pestaña "Sectores" de la ficha del cliente: pide SUS datos al abrirse.
 *
 * Desde tsk-745 un sector pertenece a UN cliente (`sectors.customer_id`); antes era una tabla global
 * compartida por pivote. El cliente lo fija la ficha, igual que en Áreas.
 */
export function CustomerSectorsTab({ customer, canCreate, canUpdate }: CustomerSectorsTabProps) {
  const sectorsQuery = useQuery({
    queryKey: customerTabKey(customer.id, 'sectors'),
    queryFn: () => getSectorsByCustomer(customer.id),
    staleTime: 60 * 1000,
  });
  const preferences = useTablePreferences(TABLE_ID);

  let content: React.ReactNode;
  if (sectorsQuery.isError) {
    content = (
      <QueryErrorState
        title="No se pudieron cargar los sectores del cliente"
        isRetrying={sectorsQuery.isFetching}
        onRetry={() => sectorsQuery.refetch()}
      />
    );
  } else if (sectorsQuery.isPending || preferences.isPending) {
    content = <CustomersTableSkeleton rows={4} />;
  } else {
    content = (
      <SectorTable
        contractorSectors={sectorsQuery.data}
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
        <h2 className="text-xl font-bold">Sectores</h2>
        {canCreate ? <SectorFormDialog customerId={customer.id} triggerLabel="Nuevo sector" /> : null}
      </div>
      {content}
    </div>
  );
}
