import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTablePreferences } from '@/shared/actions/table-preferences';
import { stripPrefixFromSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Suspense } from 'react';
import { getDeviationsMetricsCached } from '../lib/section-counts';
import { getEquipmentsWithDeviationsPaginated } from './actions.server';
import { DeviationMetrics, type DeviationMetricsData } from './components/DeviationMetrics';
import { _EquiposConDesviosDataTable } from './components/_EquiposConDesviosDataTable';
import { DEVIATIONS_PARAM_NAMESPACE, DEVIATIONS_TABLE_ID } from './constants';
import { DeviationMetricsSkeleton } from '@/features/Mantenimiento/EquiposConDesvios/fallback/EquipmentsWithDeviationsSkeleton';

interface Props {
  searchParams: DataTableSearchParams;
}

/** Resuelve las métricas en su propio Suspense: no frenan la tabla ni la tabla frena a las tarjetas. */
async function DeviationMetricsLoader({
  metrics,
  serverAttention,
}: {
  metrics: Promise<DeviationMetricsData>;
  serverAttention: string | null;
}) {
  return <DeviationMetrics initialMetrics={await metrics} serverAttention={serverAttention} />;
}

export async function EquiposConDesviosList({ searchParams }: Props) {
  // Aislar parámetros de URL para esta tabla (el namespace NO cambió con el tableId `-v2`)
  const tableParams = stripPrefixFromSearchParams(searchParams, DEVIATIONS_PARAM_NAMESPACE);
  const attention = tableParams.attention;

  // Las métricas arrancan ANTES de esperar la tabla (nunca rechaza: si falla devuelve null y se muestra "—")
  const metrics = getDeviationsMetricsCached();

  const [{ data, total }, preferences] = await Promise.all([
    getEquipmentsWithDeviationsPaginated(tableParams),
    getTablePreferences(DEVIATIONS_TABLE_ID),
  ]);

  return (
    <div className="space-y-4">
      <Suspense fallback={<DeviationMetricsSkeleton />}>
        <DeviationMetricsLoader metrics={metrics} serverAttention={typeof attention === 'string' ? attention : null} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Equipos con Desvíos Pendientes</CardTitle>
          <CardDescription>Desvíos del checklist que todavía no forman parte de un pedido.</CardDescription>
        </CardHeader>
        <CardContent>
          <_EquiposConDesviosDataTable
            data={data}
            totalRows={total}
            searchParams={tableParams}
            tableId={DEVIATIONS_TABLE_ID}
            initialColumnVisibility={preferences.columnVisibility ?? {}}
            initialFilterVisibility={preferences.filterVisibility ?? {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
