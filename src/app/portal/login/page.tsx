import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AuthShell } from '@/features/Auth/components/AuthShell';
import { AuthSkeleton } from '@/features/Auth/components/AuthSkeleton';
import { CredentialsLoginForm } from '@/features/Auth/components/CredentialsLoginForm';
import { requireInstanceRoute } from '@/features/Modules/server/public-routes.server';
import { getPortalSession } from '@/features/Portal/actions/perimeter';
import { portalLogin, portalLogout } from '@/features/Portal/actions/session.server';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const metadata = { title: 'Ingresar' };

interface PortalLoginPageProps {
  searchParams: Promise<{ activado?: string }>;
}

const DENIED_MESSAGES: Record<string, string> = {
  'no-employee': 'Tu usuario no tiene un legajo vinculado en esta empresa.',
  'no-access': 'Tu acceso al portal no está habilitado.',
  inactive: 'Tu legajo figura dado de baja.',
};

async function PortalLoginContent({ searchParams }: PortalLoginPageProps) {
  // Antes de saber la empresa, el módulo `portal` se corta por la instancia (F3; `requireInstanceRoute` ya hace
  // antes de la consulta (con `cacheComponents`, leer la base sin eso rompe el prerender).
  await requireInstanceRoute('/portal');
  const [session, { activado }] = await Promise.all([getPortalSession(), searchParams]);
  if (session.ok) redirect('/portal');

  // Hay sesión pero no sirve para el portal (usuario del dashboard sin acceso, legajo dado de baja…): se avisa y se
  // ofrece cerrarla en vez de mostrar un formulario que volvería a rebotar.
  const deniedMessage = !session.ok ? DENIED_MESSAGES[session.reason] : undefined;

  return (
    <AuthShell
      kicker="Portal del empleado"
      title="Ingresá a tu portal"
      description="Consultá tus datos y, pronto, tus documentos para leer y aceptar."
    >
      <div className="space-y-6">
        {activado === '1' && !deniedMessage && (
          <Alert>
            <CircleCheck />
            <AlertTitle className="line-clamp-none">Contraseña guardada</AlertTitle>
            <AlertDescription>Ya podés ingresar con tu correo y la contraseña que elegiste.</AlertDescription>
          </Alert>
        )}
        {deniedMessage ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle className="line-clamp-none">{deniedMessage}</AlertTitle>
              <AlertDescription>Si creés que es un error, pedíselo a Recursos Humanos.</AlertDescription>
            </Alert>
            <form action={portalLogout}>
              <Button type="submit" variant="outline" size="lg" className="min-h-11 w-full">
                Ingresar con otro usuario
              </Button>
            </form>
          </div>
        ) : (
          <CredentialsLoginForm
            action={portalLogin}
            redirectTo="/portal"
            helpText="El acceso lo habilita Recursos Humanos. Si no recibiste la invitación o perdiste la contraseña temporal, pedí una nueva."
          />
        )}
      </div>
    </AuthShell>
  );
}

export default function PortalLoginPage(props: PortalLoginPageProps) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <PortalLoginContent {...props} />
    </Suspense>
  );
}
