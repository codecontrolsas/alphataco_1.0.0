import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { _CustomersDataTable } from './_CustomersDataTable';
import { getCustomersPaginated } from './actions.server';

interface CustomersListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = 'customers';

/** Listado de clientes de la empresa activa (paginado en el servidor). */
export async function CustomersList({ searchParams, permissionsMap }: CustomersListProps) {
  // Solo los params de esta tabla (la página tiene otras con su propio namespace).
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getCustomersPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <_CustomersDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={TABLE_ID}
      permissionsMap={permissionsMap}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
