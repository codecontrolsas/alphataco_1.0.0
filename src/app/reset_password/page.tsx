import { AuthShell } from '@/features/Auth/components/AuthShell';
import { RecoveryPasswordForm } from '@/features/Auth/components/RecoveryPasswordForm';

export default function PasswordRecovery() {
  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-display text-balance">¿Olvidaste tu contraseña?</h1>
        <p className="text-body text-muted-foreground">No te preocupes, te ayudaremos a restablecerla.</p>
      </div>
      <div className="mt-8">
        <RecoveryPasswordForm />
      </div>
    </AuthShell>
  );
}
