'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CustomerForm } from '../components/CustomerForm';
import { buildBooleanFacetResult } from '../lib/facet-results';
import { CUSTOMERS_LIST_QUERY_KEY } from '../lib/query-keys';
import { getAllCustomersForExport, getCustomerSingleFacet, getCustomersPaginated } from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, columns } from './columns';

interface Props {
  data: Awaited<ReturnType<typeof getCustomersPaginated>>['data'];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissionsMap: Record<string, boolean>;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['is_active', 'name', 'cuit'];

export function _CustomersDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissionsMap,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const canCreate = permissionsMap['comercial:customers:create'] === true;

  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCustomersPaginated(params), []);

  const fetchStatusFacet = useCallback(async (params: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getCustomerSingleFacet('is_active', params);
    if (!result) return { options: [], counts: new Map() };
    return buildBooleanFacetResult(result.counts, 'Activo', 'Inactivo');
  }, []);

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(
    () => [
      { columnId: 'is_active', title: 'Estado', fetchFacet: fetchStatusFacet },
      { columnId: 'name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      { columnId: 'cuit', title: 'CUIT', type: 'text', placeholder: 'Buscar por CUIT...' },
      { columnId: 'client_email', title: 'Email', type: 'text', placeholder: 'Buscar por email...' },
      { columnId: 'client_phone', title: 'Teléfono', type: 'text', placeholder: 'Buscar por teléfono...' },
      { columnId: 'address', title: 'Dirección', type: 'text', placeholder: 'Buscar por dirección...' },
      { columnId: 'created_at', title: 'Alta', type: 'dateRange' },
    ],
    [fetchStatusFacet]
  );

  const mergedColumnVisibility = useMemo(
    () => ({ ...Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((id) => [id, false])), ...initialColumnVisibility }),
    [initialColumnVisibility]
  );

  // Preferencias guardadas primero; si no hay, solo 3 filtros visibles.
  const mergedFilterVisibility = useMemo(() => {
    if (Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const toolbarActions = canCreate ? (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="brand" size="sm">
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Registrar cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogTitle>Registrar cliente</DialogTitle>
        <DialogDescription className="sr-only">Completá los datos del nuevo cliente.</DialogDescription>
        <CustomerForm
          onSuccess={() => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: CUSTOMERS_LIST_QUERY_KEY });
          }}
        />
      </DialogContent>
    </Dialog>
  ) : undefined;

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      queryFn={tableQueryFn}
      queryKey={CUSTOMERS_LIST_QUERY_KEY}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por nombre, CUIT, email, teléfono o dirección"
      showSearch
      mobileCards
      facetedFilters={facetedFilters}
      initialColumnVisibility={mergedColumnVisibility}
      initialFilterVisibility={mergedFilterVisibility}
      tableId={tableId}
      paramNamespace={tableId}
      showFilterToggle
      toolbarActions={toolbarActions}
      rowClassName={(row) => (row.is_active === false ? 'opacity-60' : '')}
      emptyMessage="No hay clientes registrados"
      data-testid="customers-table"
      exportConfig={{
        // currentParams (no searchParams) para respetar los filtros activos después del SSR
        fetchAllData: async () => unwrapExportResult(await getAllCustomersForExport(currentParams)),
        options: { filename: 'clientes', title: 'Listado de Clientes', sheetName: 'Clientes' },
        formatters: {
          is_active: (value) => (value === false ? 'Inactivo' : 'Activo'),
          created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        },
      }}
    />
  );
}
