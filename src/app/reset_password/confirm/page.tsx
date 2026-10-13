import { AuthShell } from '@/features/Auth/components/AuthShell';
import { InvalidResetLink } from '@/features/Auth/components/InvalidResetLink';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Enlace de recuperación' };

interface ConfirmUserPasswordPageProps {
  searchParams: Promise<{ error?: string }>;
}

/** Destino de los enlaces de recuperación que fallaron (`/api/auth/reset-password/<token>` redirige con `?error=`). */
export default async function ConfirmUserPasswordPage({ searchParams }: ConfirmUserPasswordPageProps) {
  const { error } = await searchParams;

  // Sin error no hay nada que confirmar acá: el flujo vale sólo para enlaces inválidos.
  if (!error) redirect('/reset_password');

  return (
    <AuthShell kicker="Recuperar acceso" title="El enlace no es válido">
      <InvalidResetLink />
    </AuthShell>
  );
}
