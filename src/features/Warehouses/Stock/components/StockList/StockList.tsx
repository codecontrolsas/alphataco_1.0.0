import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getStockPaginated } from './actions.server';
import { _StockDataTable } from './components/_StockDataTable';

interface StockListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = 'warehouse-stock';

export async function StockList({ searchParams, permissionsMap }: StockListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getStockPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_StockDataTable
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
