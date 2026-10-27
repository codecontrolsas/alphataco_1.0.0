import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getHseTrainingsPaginated } from './actions.server';
import { _TrainingsDataTable } from './components/_TrainingsDataTable';

const TABLE_ID = 'hse-trainings';

export async function TrainingsList({ searchParams }: { searchParams: DataTableSearchParams }) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);
  // Los facets se cargan lazy en el cliente (al abrir cada filtro), no en SSR.
  const [{ data, total }, preferences] = await Promise.all([
    getHseTrainingsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);
  return (
    <Card>
      <CardContent className="pt-6">
        <_TrainingsDataTable
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
