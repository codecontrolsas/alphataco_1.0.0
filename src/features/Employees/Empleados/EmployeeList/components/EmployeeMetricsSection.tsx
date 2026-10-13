import { getEmployeeStatusMetrics } from '../actions.server';
import { EmployeeMetrics } from './EmployeeMetrics';

/** Server Component: resuelve las métricas en su propio Suspense, sin frenar la tabla. */
export async function EmployeeMetricsSection({ tableId }: { tableId: string }) {
  const metrics = await getEmployeeStatusMetrics();
  return <EmployeeMetrics tableId={tableId} metrics={metrics} />;
}
