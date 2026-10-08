import { AuthShell } from '@/features/Auth/components/AuthShell';
import { LoginForm } from '@/features/Auth/components/LoginForm';

/**
 * Pantalla de ingreso: layout partido (`AuthShell`), panel de marca a la izquierda y el
 * formulario alineado arriba a la izquierda. Mismo layout que el recupero de contraseña.
 */
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <AuthShell>
      <LoginForm error={error} />
    </AuthShell>
  );
}
