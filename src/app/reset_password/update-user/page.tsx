import { AuthShell } from '@/features/Auth/components/AuthShell';
import { InvalidResetLink } from '@/features/Auth/components/InvalidResetLink';
import { UpdateUserPasswordForm } from '@/features/Auth/components/UpdateUserPasswordForm';

export const metadata = { title: 'Nueva contraseña' };

interface UpdateUserPasswordPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function UpdateUserPasswordPage({ searchParams }: UpdateUserPasswordPageProps) {
  const { token, error } = await searchParams;
  const valid = Boolean(token) && !error;

  return (
    <AuthShell
      kicker="Recuperar acceso"
      title={valid ? 'Elegí tu nueva contraseña' : 'El enlace no es válido'}
      description={valid ? 'Después de guardarla vas a poder ingresar con ella.' : undefined}
    >
      {valid ? <UpdateUserPasswordForm token={token!} /> : <InvalidResetLink />}
    </AuthShell>
  );
}
