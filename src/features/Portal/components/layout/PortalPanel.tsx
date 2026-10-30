import { requireCompanyRoute } from '@/features/Modules/server/public-routes.server';
import { getPortalSession } from '@/features/Portal/actions/perimeter';
import { getPortalBadgeCounts, getVisiblePortalSectionIds } from '@/features/Portal/navigation/sections.server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ForcedPasswordChange } from '../account/ForcedPasswordChange';
import { PortalAppShell, PortalLockedShell } from './PortalAppShell';

/** Cookie que escribe `SidebarProvider` al colapsar o expandir el menú lateral. */
const SIDEBAR_COOKIE = 'sidebar_state';

/**
 * Perímetro del panel: sin sesión → login; con sesión que no sirve para el portal → login con el motivo; módulo
 * `portal` apagado para la empresa del legajo → 404; con contraseña temporal sin cambiar → solo el cambio de contraseña
 * (sin menú ni consultas de pendientes). Corre dentro del Suspense del layout, así que leer la cookie del menú es seguro.
 */
export async function PortalPanel({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session.ok) redirect('/portal/login');

  const { employee } = session;
  // Módulo `portal` apagado para la empresa del legajo (o en la instancia): el portal «no existe».
  await requireCompanyRoute('/portal', employee.companyId);

  if (employee.needsPasswordChange) {
    return (
      <PortalLockedShell employee={employee}>
        <ForcedPasswordChange />
      </PortalLockedShell>
    );
  }

  const [visibleIds, cookieStore] = await Promise.all([getVisiblePortalSectionIds(employee.companyId), cookies()]);
  // Sin `await`: los contadores llegan por streaming a los badges del menú sin frenar el marco. Se pasa el MISMO
  // `employee` de la sesión para que las consultas memoizadas se compartan con la página.
  const badges = getPortalBadgeCounts(employee, visibleIds);

  return (
    <PortalAppShell
      employee={employee}
      visibleIds={visibleIds}
      badges={badges}
      defaultOpen={cookieStore.get(SIDEBAR_COOKIE)?.value !== 'false'}
    >
      {children}
    </PortalAppShell>
  );
}
