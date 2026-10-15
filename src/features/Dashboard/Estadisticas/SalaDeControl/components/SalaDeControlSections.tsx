import { getDeviationsChartData } from '../actions/actions.server';
import { getPreparteKpiData } from '../actions/preparte-kpi.server';
import { DesviosChartsDynamic } from './DesviosChartsDynamic';
import { OrderManagementDynamic } from './OrderManagementDynamic';

/** Widget «Desvíos del parte diario» (Control de desvíos). */
export async function DesviosSection() {
  const deviationsData = await getDeviationsChartData();
  return <DesviosChartsDynamic data={deviationsData} />;
}

/** Widget «Gestión de pedidos» (Control de desvíos). */
export async function OrderManagementSection() {
  const preparteKpiData = await getPreparteKpiData();
  return <OrderManagementDynamic data={preparteKpiData} />;
}
