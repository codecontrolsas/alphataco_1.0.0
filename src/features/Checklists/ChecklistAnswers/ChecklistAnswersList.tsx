import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getChecklistAnswersPaginated } from './actions.server';
import { _ChecklistAnswersDataTable } from './components/_ChecklistAnswersDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TABLE_ID = 'checklist-answers';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  searchParams: DataTableSearchParams;
  templateId: string;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function ChecklistAnswersList({ searchParams, templateId }: Props) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getChecklistAnswersPaginated(tableParams, templateId),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <_ChecklistAnswersDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={TABLE_ID}
      templateId={templateId}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
