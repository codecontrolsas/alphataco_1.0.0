import { getEmployeeStatusMetrics } from '../actions.server';
import { EmployeeMetrics } from './EmployeeMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function EmployeeMetricsSection({
  tableId,
  metrics,
}: {
  tableId: string;
  metrics: ReturnType<typeof getEmployeeStatusMetrics>;
}) {
  return <EmployeeMetrics tableId={tableId} metrics={await metrics} />;
}
