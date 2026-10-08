import { AuthShell } from '@/features/Auth/components/AuthShell';
import { UpdateUserPasswordForm } from '@/features/Auth/components/UpdateUserPasswordForm';

export default function UpdateUserPassword() {
  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-display text-balance">Establece tu nueva contraseña</h1>
        <p className="text-body text-pretty text-muted-foreground">
          Tu cuenta está a un paso de ser recuperada. Por favor, crea una nueva contraseña que sea segura y fácil de
          recordar para ti. Asegúrate de que tu contraseña tenga al menos 6 caracteres, incluya una combinación de
          letras mayúsculas, minúsculas, números o símbolos.
        </p>
      </div>
      <div className="mt-8">
        <UpdateUserPasswordForm />
      </div>
    </AuthShell>
  );
}
