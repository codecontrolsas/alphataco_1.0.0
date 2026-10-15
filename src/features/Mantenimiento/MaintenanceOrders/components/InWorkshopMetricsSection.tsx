import { Suspense } from 'react';
import { InWorkshopMetricsSkeleton } from '../fallback/MaintenanceOrdersSkeleton';
import type { getInWorkshopMetrics } from '../table/actions/metrics.server';
import { InWorkshopMetrics } from './InWorkshopMetrics';

async function Metrics({
  metrics,
  serverAttention,
}: {
  metrics: ReturnType<typeof getInWorkshopMetrics>;
  serverAttention: string | null;
}) {
  return <InWorkshopMetrics initialData={await metrics} serverAttention={serverAttention} />;
}

/**
 * Server Component: resuelve la banda y las tarjetas en su propio Suspense, sin frenar la tabla. La promesa
 * se inicia en la lista ANTES de esperar la tabla; `getInWorkshopMetrics` nunca rechaza (devuelve `null`).
 */
export function InWorkshopMetricsSection({
  metrics,
  serverAttention = null,
}: {
  metrics: ReturnType<typeof getInWorkshopMetrics>;
  serverAttention?: string | null;
}) {
  return (
    <Suspense fallback={<InWorkshopMetricsSkeleton />}>
      <Metrics metrics={metrics} serverAttention={serverAttention} />
    </Suspense>
  );
}
