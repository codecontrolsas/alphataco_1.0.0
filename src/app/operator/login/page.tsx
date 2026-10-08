import { LoginForm } from '@/features/OperatorPanel/components/LoginForm';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Iniciar Sesion - Panel de Operario',
};

export default async function OperatorLoginPage() {
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
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
