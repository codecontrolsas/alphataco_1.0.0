import type { getPreparteStatusMetrics } from '../metrics.server';
import { PreparteMetrics } from './PreparteMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function PreparteMetricsSection({
  tableId,
  metrics,
}: {
  tableId: string;
  metrics: ReturnType<typeof getPreparteStatusMetrics>;
}) {
  return <PreparteMetrics tableId={tableId} metrics={await metrics} />;
}
