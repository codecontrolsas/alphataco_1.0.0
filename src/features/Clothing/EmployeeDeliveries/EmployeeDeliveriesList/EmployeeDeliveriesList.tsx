import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getEmployeeDeliveriesPaginated } from './actions.server';
import _EmployeeDeliveriesDataTable from './components/_EmployeeDeliveriesDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'employee-deliveries';

// ============================================================================
// TYPES
// ============================================================================

interface EmployeeDeliveriesListProps {
  employeeId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function EmployeeDeliveriesList({ employeeId, searchParams }: EmployeeDeliveriesListProps) {
  // Extraer solo los params de esta tabla (quitar prefijo del namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  const [{ data, total }, preferences, permissionsMap] = await Promise.all([
    getEmployeeDeliveriesPaginated(employeeId, tableParams),
    getTablePreferences(TABLE_ID),
    getUserPermissionsMapServer(),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <_EmployeeDeliveriesDataTable
          employeeId={employeeId}
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
