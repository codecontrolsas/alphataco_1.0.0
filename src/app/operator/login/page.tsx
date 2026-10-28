import { AuthShell } from '@/features/Auth/components/AuthShell';
import { CredentialsLoginForm } from '@/features/Auth/components/CredentialsLoginForm';
import { requireInstanceRoute } from '@/features/Modules/server/public-routes.server';
import { operatorLogin } from '@/features/OperatorPanel/actions/session.server';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Panel de operario',
};

export default async function OperatorLoginPage() {
  await requireInstanceRoute('/operator');
  // Si ya hay sesión con contexto de operario válido, se salta el login.
  const userId = await getSessionUserId();

  if (userId) {
    // El profile se resuelve por `credential_id`, igual que en `operatorLogin()`: el perímetro
    // es la propia sesión.
    const profile = await prisma.profile.findUnique({
      where: { credential_id: userId },
      select: { employee_id: true },
    });

    if (profile?.employee_id) {
      const assigned = await prisma.employee_workshop_sectors.findFirst({
        where: { employee_id: profile.employee_id, workshop_sectors: { is_active: true } },
        select: { workshop_sector_id: true },
      });

      if (assigned) {
        redirect('/operator/dashboard');
      }
    }
  }

  return (
    <AuthShell
      kicker="Panel de operario"
      title="Ingresá al panel de taller"
      description="Acceso exclusivo para operarios de taller."
    >
      <CredentialsLoginForm
        action={operatorLogin}
        redirectTo="/operator/dashboard"
        helpText="Si no tenés acceso, pedíselo al jefe de taller o a un administrador."
      />
    </AuthShell>
  );
}
