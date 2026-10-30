import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthShell } from '@/features/Auth/components/AuthShell';
import { AuthSkeleton } from '@/features/Auth/components/AuthSkeleton';
import { UpdateUserPasswordForm } from '@/features/Auth/components/UpdateUserPasswordForm';
import { requireInstanceRoute } from '@/features/Modules/server/public-routes.server';
import { PortalAuthAside } from '@/features/Portal/components/auth/PortalAuthAside';
import { CircleAlert } from 'lucide-react';
import { Suspense } from 'react';

export const metadata = { title: 'Activar acceso' };

interface PortalActivatePageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

/**
 * Destino del enlace de invitación: `/api/auth/reset-password/<token>?callbackURL=/portal/activate` valida el token de
 * un solo uso y redirige acá con `?token=` (o `?error=` si venció o ya se usó).
 */
async function PortalActivateContent({ searchParams }: PortalActivatePageProps) {
  const { token, error } = await searchParams;
  // Antes de saber la empresa, el portal se corta por la instancia (F3.3), igual que el login.
  await requireInstanceRoute('/portal');
  const valid = Boolean(token) && !error;

  return (
    <AuthShell
      kicker="Portal del empleado"
      aside={<PortalAuthAside />}
      title={valid ? 'Elegí tu contraseña' : 'El enlace no es válido'}
      description={valid ? 'Con ella vas a entrar al portal desde el celular o la computadora.' : undefined}
    >
      {valid && token ? (
        <UpdateUserPasswordForm token={token} redirectTo="/portal/login?activado=1" />
      ) : (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle className="line-clamp-none">Enlace vencido o ya usado</AlertTitle>
          <AlertDescription>
            Los enlaces de activación sirven una sola vez y vencen a las 24 horas. Pedile a Recursos Humanos que te
            reenvíe la invitación.
          </AlertDescription>
        </Alert>
      )}
    </AuthShell>
  );
}

export default function PortalActivatePage(props: PortalActivatePageProps) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <PortalActivateContent {...props} />
    </Suspense>
  );
}
