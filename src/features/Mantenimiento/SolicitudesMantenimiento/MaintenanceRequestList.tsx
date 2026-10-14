import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Card, CardContent } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { MaintenanceRequestDataTable } from './_MaintenanceRequestDataTable';
import { getAllMaintenanceRequestsForExport, getMaintenanceRequestsPaginated } from './actions/actionsTableServer';

export const TABLE_ID = 'maintenance-requests';

interface MaintenanceRequestListProps {
  searchParams: DataTableSearchParams;
}

export async function MaintenanceRequestList({ searchParams }: MaintenanceRequestListProps) {
  // Aislar parámetros de URL para esta tabla específica
  const tableSearchParams = stripPrefixFromSearchParams(searchParams, TABLE_ID);

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  // Aprobar / rechazar / reasignar = `update` en la tab (mapa de permisos: maintenance_requests).
  const [{ data, total }, preferences, canApproveReject] = await Promise.all([
    getMaintenanceRequestsPaginated(tableSearchParams),
    getTablePreferences(TABLE_ID),
    checkPermissionServer('mantenimiento', 'maintenance_requests', 'update'),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <MaintenanceRequestDataTable
          data={data}
          totalRows={total}
          searchParams={tableSearchParams}
          tableId={TABLE_ID}
          initialColumnVisibility={preferences.columnVisibility ?? {}}
          initialFilterVisibility={preferences.filterVisibility ?? {}}
          canApproveReject={canApproveReject}
          fetchAllForExport={getAllMaintenanceRequestsForExport}
        />
      </CardContent>
    </Card>
  );
}
