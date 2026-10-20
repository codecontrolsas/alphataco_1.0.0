import { getOrgChart } from './actions.server';
import { OrgChartClient } from './components/OrgChartClient';

/** Organigrama de la empresa: datos en el servidor, interacción en el cliente. */
export default async function OrgChartSection({ permissions }: { permissions: Record<string, boolean> }) {
  const initialData = await getOrgChart();
  return <OrgChartClient initialData={initialData} permissions={permissions} />;
}
