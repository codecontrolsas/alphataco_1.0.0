import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getFormsPaginated } from './actions.server';
import { _FormsDataTable } from './components/_FormsDataTable';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  searchParams: DataTableSearchParams;
  permissionsMap: Record<string, boolean>;
  canConfigure: boolean;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

const TABLE_ID = 'forms';

export async function FormsList({ searchParams, permissionsMap, canConfigure }: Props) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getFormsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_FormsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          permissionsMap={permissionsMap}
          canConfigure={canConfigure}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
        />
      </CardContent>
    </Card>
  );
}
