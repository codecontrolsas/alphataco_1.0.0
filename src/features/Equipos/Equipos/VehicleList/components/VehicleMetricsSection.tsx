import { getVehicleConditionMetrics } from '../metrics.server';
import { VehicleMetrics } from './VehicleMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function VehicleMetricsSection({ tableId }: { tableId: string }) {
  const metrics = await getVehicleConditionMetrics();
  return <VehicleMetrics tableId={tableId} metrics={metrics} />;
}
