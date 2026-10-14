import { getVehicleConditionMetrics } from '../metrics.server';
import { VehicleMetrics } from './VehicleMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function VehicleMetricsSection({
  tableId,
  metrics,
}: {
  tableId: string;
  metrics: ReturnType<typeof getVehicleConditionMetrics>;
}) {
  return <VehicleMetrics tableId={tableId} metrics={await metrics} />;
}
