import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { CatalogTableSurface } from '@/shared/components/common/CatalogFormSheet';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getDiagramReportsPaginated } from './actions.server';
import _DiagramReportsDataTable from './components/_DiagramReportsDataTable';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_ID = 'diagram-reports';

// ============================================================================
// TYPES
// ============================================================================

interface DiagramReportsListProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function DiagramReportsList({ searchParams }: DiagramReportsListProps) {
  // Extract only params for this table (strip namespace prefix)
  const tableParams = stripPrefixFromSearchParams(searchParams as DataTableSearchParams, TABLE_ID);

  // Facets load lazy (on-demand on popover open) — NOT in SSR.
  // Editar una novedad exige `update` en `new` o en `employees` (lo mismo que valida `UpdateDiagramsById`);
  // la pestaña `reports` solo admite `view`.
  const [{ data, total }, preferences, canUpdateInNew, canUpdateInEmployees] = await Promise.all([
    getDiagramReportsPaginated(tableParams),
    getTablePreferences(TABLE_ID),
    checkPermissionServer('empleados', 'new', 'update'),
    checkPermissionServer('empleados', 'employees', 'update'),
  ]);

  return (
    <CatalogTableSurface>
      <_DiagramReportsDataTable
        data={data}
        totalRows={total}
        searchParams={tableParams}
        tableId={TABLE_ID}
        canUpdate={canUpdateInNew || canUpdateInEmployees}
        initialColumnVisibility={preferences.columnVisibility ?? {}}
        initialFilterVisibility={preferences.filterVisibility ?? {}}
      />
    </CatalogTableSurface>
  );
}
