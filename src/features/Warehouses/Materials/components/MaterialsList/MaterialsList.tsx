import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getMaterialsPaginated } from './actions.server';
import { _MaterialsDataTable } from './components/_MaterialsDataTable';

interface MaterialsListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = 'warehouse-materials';

export async function MaterialsList({ searchParams, permissionsMap }: MaterialsListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getMaterialsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_MaterialsDataTable
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
