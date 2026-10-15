import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { type DataTableSearchParams, stripPrefixFromSearchParams } from '@/shared/components/common/DataTable';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { Suspense } from 'react';
import { getPendingOrderMetrics } from '../actions/metrics.server';
import { PendingOrderMetrics, type PendingOrderMetricsData } from '../components/PendingOrderMetrics';
import { PENDING_PARAM_NAMESPACE, PENDING_TABLE_ID } from '../constants';
import { PendingOrderMetricsSkeleton } from '../fallback';
import { getPendingOrdersPaginated } from './actions.server';
import { _PendingOrderDataTable } from './components/_PendingOrderDataTable';

interface Props {
  searchParams: DataTableSearchParams;
}

/** Resuelve las tarjetas en su propio Suspense: no frenan a la tabla. */
async function PendingMetricsSection({
  metrics,
  serverAttention,
}: {
  metrics: Promise<PendingOrderMetricsData>;
  serverAttention: string | null;
}) {
  return <PendingOrderMetrics initialMetrics={await metrics} serverAttention={serverAttention} />;
}

export async function PendingOrderList({ searchParams }: Props) {
  // Aislar los URL params de esta tabla con su namespace
  const tableSearchParams = stripPrefixFromSearchParams(searchParams, PENDING_PARAM_NAMESPACE);

  // Las tarjetas arrancan antes de esperar la tabla. `getPendingOrderMetrics` nunca rechaza (devuelve `null`
  // si falla y las tarjetas muestran "—"), así que la promesa no queda sin manejar.
  const metrics = getPendingOrderMetrics();
  const attentionParam = tableSearchParams.attention;
  const serverAttention = typeof attentionParam === 'string' ? attentionParam : null;

  // Planificar y rechazar exigen `update` en esta tab (mismo permiso que el servidor).
  const [{ data, total }, tablePreferences, canUpdate] = await Promise.all([
    getPendingOrdersPaginated(tableSearchParams),
    getTablePreferences(PENDING_TABLE_ID),
    checkPermissionServer('mantenimiento', 'pedidos_pendientes', 'update'),
  ]);

  return (
    <div className="space-y-4">
      <Suspense fallback={<PendingOrderMetricsSkeleton />}>
        <PendingMetricsSection metrics={metrics} serverAttention={serverAttention} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos por programar</CardTitle>
          <CardDescription>Asigná la fecha de recepción en taller o rechazá el pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          <_PendingOrderDataTable
            data={data}
            totalRows={total}
            searchParams={tableSearchParams}
            tableId={PENDING_TABLE_ID}
            paramNamespace={PENDING_PARAM_NAMESPACE}
            canUpdate={canUpdate}
            initialColumnVisibility={tablePreferences.columnVisibility ?? {}}
            initialFilterVisibility={tablePreferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
