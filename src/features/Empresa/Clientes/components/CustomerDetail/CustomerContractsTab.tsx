'use client';

import { useQuery } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { getCustomerContractsData } from '../../actions/customer-detail.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { customerTabKey } from '../../lib/query-keys';
import ServiceTable from '../Services/ServiceTable';
import { QueryErrorState } from './QueryErrorState';

/**
 * @deprecated Las tablas de contratos e ítems leen sus preferencias de la base (`useTablePreferences`), ya no
 * de cookies. Se conserva el tipo solo para no romper a los que todavía lo pasan.
 */
export interface ContractsTabPreferences {
  servicesFilters: string[];
  servicesVisibility: VisibilityState;
  serviceItemsFilters: string[];
  serviceItemsVisibility: VisibilityState;
}

interface CustomerContractsTabProps {
  customer: { id: string; name: string };
  /** @deprecated No se usa: ver `ContractsTabPreferences`. */
  preferences?: ContractsTabPreferences;
}

/**
 * Pestaña "Contratos": los contratos del cliente seleccionado (hereda permisos de comercial/service).
 * Pide SUS datos al abrirse: los contratos, áreas y sectores de este cliente y las unidades de medida.
 */
export function CustomerContractsTab({ customer }: CustomerContractsTabProps) {
  const contractsQuery = useQuery({
    queryKey: customerTabKey(customer.id, 'contracts'),
    queryFn: () => getCustomerContractsData(customer.id),
    staleTime: 60 * 1000,
  });

  let content: React.ReactNode;
  if (contractsQuery.isError) {
    content = (
      <QueryErrorState
        title="No se pudieron cargar los contratos del cliente"
        isRetrying={contractsQuery.isFetching}
        onRetry={() => contractsQuery.refetch()}
      />
    );
  } else if (contractsQuery.isPending) {
    content = <CustomersTableSkeleton rows={4} />;
  } else {
    const { services, areas, sectors, measureUnits } = contractsQuery.data;
    content = (
      <ServiceTable
        services={services}
        customers={[{ id: customer.id, name: customer.name }]}
        areas={areas}
        sectors={sectors}
        measureUnits={measureUnits}
      />
    );
  }

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h3 className="mb-6 text-xl font-semibold">Contratos del Cliente</h3>
      {content}
    </div>
  );
}
