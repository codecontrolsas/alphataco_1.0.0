import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getDepotsPaginated } from './actions.server';
import { _DepotsDataTable } from './components/_DepotsDataTable';

interface DepotsListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = 'warehouse-depots';

export async function DepotsList({ searchParams, permissionsMap }: DepotsListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getDepotsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_DepotsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          permissionsMap={permissionsMap}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
