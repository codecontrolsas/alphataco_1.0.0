import { PortalAccessPanel } from './components/PortalAccessPanel';
import { getEmployeePortalAccessOverview } from './queries.server';

/** Sección "Portal" del legajo (Server Component): trae el estado y se lo pasa al panel interactivo. */
export async function PortalAccessTabContent({ employeeId }: { employeeId: string }) {
  const overview = await getEmployeePortalAccessOverview(employeeId);
  if (!overview) {
    return <p className="text-muted-foreground text-sm">No tenés acceso a la información del portal de este legajo.</p>;
  }
  return <PortalAccessPanel employeeId={employeeId} overview={overview} />;
}
