import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getTireTypesPaginated } from '../actions/type-list.server';
import _TiposDataTable from './_TiposDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'tire-types';

// ============================================================================
// TYPES
// ============================================================================

interface TiposListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function TiposList({ searchParams, permissionsMap }: TiposListProps) {
  // Extract only the params for this table (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets are loaded lazy (on-demand when each popover opens) — not in SSR
  const [{ data, total }, preferences] = await Promise.all([
    getTireTypesPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_TiposDataTable
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
