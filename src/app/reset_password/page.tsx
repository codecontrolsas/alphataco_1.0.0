import { AuthShell } from '@/features/Auth/components/AuthShell';
import { RecoveryPasswordForm } from '@/features/Auth/components/RecoveryPasswordForm';

export const metadata = { title: 'Recuperar acceso' };

export default function PasswordRecoveryPage() {
  return (
    <AuthShell
      kicker="Recuperar acceso"
      title="Restablecé tu contraseña"
      description="Te enviamos un enlace por correo para elegir una nueva."
    >
      <RecoveryPasswordForm />
    </AuthShell>
  );
}
