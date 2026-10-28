import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getHseTimesPaginated } from './actions.server';
import { _TimesDataTable } from './components/_TimesDataTable';

const TABLE_ID = 'hse-times';

/** Tiempos de estudio y de examen por empleado y capacitación. */
export async function TimesList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);
  const [{ data, total }, preferences] = await Promise.all([
    getHseTimesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);
  return (
    <Card>
      <CardContent className="pt-6">
        <_TimesDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
