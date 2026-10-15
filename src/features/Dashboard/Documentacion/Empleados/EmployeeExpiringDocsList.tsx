import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { _EmployeeExpiringDocsDataTable } from './_EmployeeExpiringDocsDataTable';
import { getEmployeeExpiringDocsPaginated } from './actions.server';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TABLE_ID = 'dashboard-employee-expiring-docs';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function EmployeeExpiringDocsList({ searchParams }: Props) {
  if (!(await canViewDashboard('empleados'))) return <DashboardNoPermission />;

  // Extraer solo los params de esta tabla (quitar prefijo de namespace)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  const [{ data, total }, preferences] = await Promise.all([
    getEmployeeExpiringDocsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
  ]);

  return (
    <_EmployeeExpiringDocsDataTable
      data={data}
      totalRows={total}
      searchParams={tableParams}
      tableId={TABLE_ID}
      initialColumnVisibility={preferences.columnVisibility ?? {}}
      initialFilterVisibility={preferences.filterVisibility ?? {}}
    />
  );
}
