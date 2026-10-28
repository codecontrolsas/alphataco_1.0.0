import { requireCompanyRoute } from '@/features/Modules/server/public-routes.server';
import { getPortalSession } from '@/features/Portal/actions/perimeter';
import { redirect } from 'next/navigation';
import { ForcedPasswordChange } from './ForcedPasswordChange';
import { PortalShell } from './PortalShell';

/**
 * Perímetro del panel: sin sesión → login; con sesión que no sirve para el portal → login con el motivo; con contraseña
 * temporal sin cambiar → solo el cambio de contraseña (sin navegación).
 */
export async function PortalPanel({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session.ok) redirect('/portal/login');

  const { employee } = session;
  // Módulo `portal` apagado para la empresa del legajo (o en la instancia): el portal «no existe».
  await requireCompanyRoute('/portal', employee.companyId);
  const shellEmployee = {
    companyName: employee.companyName,
    firstname: employee.firstname,
    lastname: employee.lastname,
    file: employee.file,
    picture: employee.picture,
  };

  if (employee.needsPasswordChange) {
    return (
      <PortalShell employee={shellEmployee} showNav={false}>
        <ForcedPasswordChange />
      </PortalShell>
    );
  }
  return <PortalShell employee={shellEmployee}>{children}</PortalShell>;
}
