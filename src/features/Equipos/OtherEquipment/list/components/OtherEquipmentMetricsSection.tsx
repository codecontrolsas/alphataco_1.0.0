import { getOtherEquipmentConditionMetrics } from '../metrics.server';
import { OtherEquipmentMetrics } from './OtherEquipmentMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function OtherEquipmentMetricsSection({ tableId }: { tableId: string }) {
  const metrics = await getOtherEquipmentConditionMetrics();
  return <OtherEquipmentMetrics tableId={tableId} metrics={metrics} />;
}
