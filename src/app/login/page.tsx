import { AuthShell } from '@/features/Auth/components/AuthShell';
import { LoginForm } from '@/features/Auth/components/LoginForm';
import { safeNextPath } from '@/features/Auth/lib/redirect';
import { showGoogleLoginButton } from '@/shared/lib/auth';
import { getSessionUserId } from '@/shared/lib/session';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Ingresar' };

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next, reset } = await searchParams;
  const nextPath = safeNextPath(next);

  // Con la sesión abierta no hay nada que hacer acá.
  if (await getSessionUserId()) redirect(nextPath);

  return (
    <AuthShell
      kicker="Acceso"
      title="Ingresá a tu espacio de trabajo"
      description="Usá el correo con el que tu empresa te dio de alta."
    >
      <LoginForm
        next={nextPath}
        oauthFailed={error === 'oauth'}
        passwordUpdated={reset === 'ok'}
        showGoogle={showGoogleLoginButton}
      />
    </AuthShell>
  );
}
