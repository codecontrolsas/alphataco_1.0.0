import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { DashboardNoPermission } from '@/features/Dashboard/shared/DashboardNoPermission';
import { ChartColorVars } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import { getDeviationsChartData } from './actions/actions.server';
import { getPreparteKpiData } from './actions/preparte-kpi.server';
import { DesviosChartsDynamic } from './components/DesviosChartsDynamic';
import { OrderManagementDynamic } from './components/OrderManagementDynamic';
import { DesviosChartsSkeleton } from './fallback/DesviosChartsSkeleton';
import { OrderManagementSkeleton } from './fallback/OrderManagementSkeleton';

async function DesviosSection() {
  const deviationsData = await getDeviationsChartData();
  return <DesviosChartsDynamic data={deviationsData} />;
}

async function OrderManagementSection() {
  const preparteKpiData = await getPreparteKpiData();
  return <OrderManagementDynamic data={preparteKpiData} />;
}

export default async function SalaDeControlTabContent() {
  if (!(await canViewDashboard('desvios'))) return <DashboardNoPermission />;

  // Cada bloque carga y falla por separado: la consulta de pedidos no frena los desvíos ni los tira abajo.
  return (
    <div data-dashboard-colors="" className="space-y-3">
      <ChartColorVars />
      <SectionErrorBoundary title="No se pudieron mostrar los desvíos del parte diario">
        <Suspense fallback={<DesviosChartsSkeleton />}>
          <DesviosSection />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary title="No se pudo mostrar la gestión de pedidos">
        <Suspense fallback={<OrderManagementSkeleton />}>
          <OrderManagementSection />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
