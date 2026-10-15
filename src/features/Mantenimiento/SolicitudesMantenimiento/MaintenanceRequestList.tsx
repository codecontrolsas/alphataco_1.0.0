import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams, type DataTableSearchParams } from '@/shared/components/common/DataTable';
import { Suspense } from 'react';
import { MaintenanceRequestDataTable } from './_MaintenanceRequestDataTable';
import { getAllMaintenanceRequestsForExport, getMaintenanceRequestsPaginated } from './actions/actionsTableServer';
import { getMaintenanceRequestMetrics } from './actions/metrics.server';
import { RequestMetrics, type RequestMetricsData } from './components/RequestMetrics';
import { REQUESTS_PARAM_NAMESPACE, REQUESTS_TABLE_ID } from './constants';
import { RequestMetricsSkeleton } from './fallback';

export const TABLE_ID = REQUESTS_TABLE_ID;

interface MaintenanceRequestListProps {
  searchParams: DataTableSearchParams;
}

/** Resuelve las métricas en su propio Suspense: no frenan la tabla ni la tabla frena a las tarjetas. */
async function RequestMetricsLoader({
  metrics,
  serverAttention,
}: {
  metrics: Promise<RequestMetricsData>;
  serverAttention: string | null;
}) {
  return <RequestMetrics initialMetrics={await metrics} serverAttention={serverAttention} />;
}

export async function MaintenanceRequestList({ searchParams }: MaintenanceRequestListProps) {
  // Aislar parámetros de URL para esta tabla específica (el namespace NO cambió con el tableId `-v2`)
  const tableSearchParams = stripPrefixFromSearchParams(searchParams, REQUESTS_PARAM_NAMESPACE);
  const attention = tableSearchParams.attention;

  // Las métricas arrancan ANTES de esperar la tabla (nunca rechaza: si falla devuelve null y se muestra "—")
  const metrics = getMaintenanceRequestMetrics();

  // Facets se cargan lazy (on-demand al abrir cada popover) — no en SSR
  // Aprobar / rechazar / reasignar = `update` en la tab (mapa de permisos: maintenance_requests).
  const [{ data, total }, preferences, canApproveReject] = await Promise.all([
    getMaintenanceRequestsPaginated(tableSearchParams),
    getTablePreferences(TABLE_ID),
    checkPermissionServer('mantenimiento', 'maintenance_requests', 'update'),
  ]);

  return (
    <div className="space-y-4">
      <Suspense fallback={<RequestMetricsSkeleton />}>
        <RequestMetricsLoader metrics={metrics} serverAttention={typeof attention === 'string' ? attention : null} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes por validar</CardTitle>
          <CardDescription>Se aprueban o rechazan ítem por ítem. Lo aprobado pasa al taller como pedido.</CardDescription>
        </CardHeader>
        <CardContent>
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
    </div>
  );
}
