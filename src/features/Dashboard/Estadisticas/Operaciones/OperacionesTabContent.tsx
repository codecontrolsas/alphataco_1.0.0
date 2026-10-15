import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { getOperationsChartData } from './actions/actions.server';
import { OperacionesChartsDynamic } from './components/OperacionesChartsDynamic';

export default async function OperacionesTabContent() {
  if (!(await canViewDashboard('operaciones'))) return <DashboardNoPermission />;

  const chartData = await getOperationsChartData();

  return (
    <div data-dashboard-colors="" className="space-y-3">
      <ChartColorVars />
      <OperacionesChartsDynamic data={chartData} />
    </div>
  );
}
