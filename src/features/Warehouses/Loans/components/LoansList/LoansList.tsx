import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getLoansPaginated } from './actions.server';
import { _LoansDataTable } from './components/_LoansDataTable';

interface LoansListProps {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
}

const TABLE_ID = 'warehouse-loans';

export async function LoansList({ searchParams, permissionsMap }: LoansListProps) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getLoansPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_LoansDataTable
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
