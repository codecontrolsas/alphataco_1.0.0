import type { getTireStatusCounts } from '../actions/tire-list.server';
import { TireStatusMetrics } from './TireStatusMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function TireStatusMetricsSection({
  paramNamespace,
  counts,
}: {
  paramNamespace: string;
  counts: ReturnType<typeof getTireStatusCounts>;
}) {
  return <TireStatusMetrics paramNamespace={paramNamespace} counts={await counts} />;
}
