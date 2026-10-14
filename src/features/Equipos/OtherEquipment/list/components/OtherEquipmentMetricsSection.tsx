import { getOtherEquipmentConditionMetrics } from '../metrics.server';
import { OtherEquipmentMetrics } from './OtherEquipmentMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function OtherEquipmentMetricsSection({
  tableId,
  metrics,
}: {
  tableId: string;
  metrics: ReturnType<typeof getOtherEquipmentConditionMetrics>;
}) {
  return <OtherEquipmentMetrics tableId={tableId} metrics={await metrics} />;
}
