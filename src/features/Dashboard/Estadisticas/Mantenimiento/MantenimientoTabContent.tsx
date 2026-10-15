import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { getMaintenanceMonthSummary } from './actions/actions.server';
import { MantenimientoChartsDynamic } from './components/MantenimientoChartsDynamic';

export default async function MantenimientoTabContent() {
  if (!(await canViewDashboard('mantenimiento'))) return <DashboardNoPermission />;

  const initialMonthKey = argentinaDate().slice(0, 7);
  const initialSummary = await getMaintenanceMonthSummary(initialMonthKey);

  return (
    <div data-dashboard-colors="">
      <ChartColorVars />
      <MantenimientoChartsDynamic initialSummary={initialSummary} initialMonthKey={initialMonthKey} />
    </div>
  );
}
