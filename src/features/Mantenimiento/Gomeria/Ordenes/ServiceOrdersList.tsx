import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getServiceOrdersPaginated } from './actions/service-order-list.server';
import _ServiceOrdersDataTable from './components/_ServiceOrdersDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'tire-service-orders';

// ============================================================================
// TYPES
// ============================================================================

interface ServiceOrdersListProps {
  searchParams: Record<string, string | string[] | undefined>;
  permissionsMap: Record<string, boolean>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function ServiceOrdersList({ searchParams, permissionsMap }: ServiceOrdersListProps) {
  // Extract only the params for this table (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets are loaded lazy (on-demand when each popover opens) — not in SSR
  const [{ data, total }, preferences] = await Promise.all([
    getServiceOrdersPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_ServiceOrdersDataTable
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
