import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getHseTrainingCompliancePaginated } from './actions.server';
import { _TrainingComplianceDataTable } from './components/_TrainingComplianceDataTable';

const TABLE_ID = 'hse-training-compliance';

/** Cumplimiento de una capacitación: quién aprobó, intentos, pendientes y vencidas. */
export async function TrainingComplianceList({
  searchParams,
  trainingId,
}: {
  searchParams: DataTableSearchParams;
  trainingId: string;
}) {
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);
  const [{ data, total }, preferences] = await Promise.all([
    getHseTrainingCompliancePaginated(tableParams, trainingId),
    getTablePreferences(TABLE_ID),
  ]);
  return (
    <Card>
      <CardContent className="pt-6">
        <_TrainingComplianceDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          trainingId={trainingId}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
