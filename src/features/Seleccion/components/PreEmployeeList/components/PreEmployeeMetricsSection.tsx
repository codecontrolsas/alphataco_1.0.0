import { getPreEmployeeStatusMetrics } from '../metrics.server';
import { PreEmployeeMetrics } from './PreEmployeeMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function PreEmployeeMetricsSection({
  tableId,
  metrics,
}: {
  tableId: string;
  metrics: ReturnType<typeof getPreEmployeeStatusMetrics>;
}) {
  return <PreEmployeeMetrics tableId={tableId} metrics={await metrics} />;
}
