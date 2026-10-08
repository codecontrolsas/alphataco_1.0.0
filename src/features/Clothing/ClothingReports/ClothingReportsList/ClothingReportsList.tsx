import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getClothingReportsPaginated } from './actions.server';
import _ClothingReportsDataTable from './components/_ClothingReportsDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'clothing-reports';

// ============================================================================
// TYPES
// ============================================================================

interface ClothingReportsListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function ClothingReportsList({ searchParams }: ClothingReportsListProps) {
  // Extract only this table's params (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets are loaded lazy (on-demand when opening each popover) — NOT in SSR
  const [{ data, total }, preferences, permissionsMap] = await Promise.all([
    getClothingReportsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
    getUserPermissionsMapServer(),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_ClothingReportsDataTable
          data={data}
          totalRows={total}
          searchParams={tableParams}
          tableId={TABLE_ID}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
          permissionsMap={permissionsMap}
        />
      </CardContent>
    </Card>
  );
}
