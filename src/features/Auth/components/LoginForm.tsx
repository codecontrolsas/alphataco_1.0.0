import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GoogleButton from '@/features/Auth/components/GoogleButton';
import { LoginButton } from '@/features/Auth/components/LoginButton';
import { cn } from '@/lib/utils';
import { isGoogleLoginEnabled } from '@/shared/lib/auth';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';

interface LoginFormProps extends React.ComponentPropsWithoutRef<'div'> {
  /** `googleLogin()` manda a `/login?error=oauth` cuando el callback de Google falla. */
  error?: string;
}

/**
 * Formulario de ingreso, sobre `AuthShell` (sin card: el form vive directo sobre el canvas).
 *
 * Por cómo funciona el sistema:
 * - No hay "Login with Apple": el único proveedor social configurado es Google, y sólo aparece
 *   si hay credenciales (`isGoogleLoginEnabled`); sin ellas se va también el separador.
 * - No hay "Sign up": el alta de usuarios la hace un administrador (`disableSignUp`).
 * - No hay pie de Términos y Privacidad: esas páginas no existen.
 *
 * Los `<p id="email_error">` / `<p id="password_error">` NO son decorativos: `LoginButton`
 * valida con Zod en el cliente y escribe los mensajes ahí por `getElementById`. Si se les
 * cambia el id, la validación deja de mostrar errores sin que nada falle.
 */
export function LoginForm({ className, error, ...props }: LoginFormProps) {
  return (
    <div className={cn('flex flex-col gap-8', className)} {...props}>
      <div className="space-y-2">
        <h1 className="text-display text-balance">¡Es un placer verte de nuevo!</h1>
        <p className="text-body text-muted-foreground">Ingresá con tu correo y contraseña</p>
      </div>
      {error === 'oauth' ? (
        <div
          role="alert"
          className="flex gap-2.5 border border-danger-border bg-danger-soft px-3 py-2.5 text-caption text-danger-text"
        >
          <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <p>
            No pudimos iniciar sesión con Google. Si es la primera vez que entrás, pedile a un
            administrador de tu empresa que te dé de alta: el sistema no crea cuentas solo.
          </p>
        </div>
      ) : null}
      <form>
        <div className="grid gap-6">
          {isGoogleLoginEnabled && (
            <>
              <div className="flex flex-col gap-4">
                <GoogleButton />
              </div>
              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-background text-muted-foreground relative z-10 px-2">O continuá con</span>
              </div>
            </>
          )}

          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="ejemplo@correo.com"
                autoComplete="email"
                data-testid="login-email-input"
                aria-describedby="email_error"
                className="h-10"
              />
              <p id="email_error" aria-live="polite" className="min-h-4 text-caption text-danger-text" />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Contraseña</Label>
                <Link
                  href="/reset_password"
                  className="ml-auto text-caption text-primary-text underline-offset-4 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Tu contraseña"
                autoComplete="current-password"
                data-testid="login-password-input"
                aria-describedby="password_error"
                className="h-10"
              />
              <p id="password_error" aria-live="polite" className="min-h-4 text-caption text-danger-text" />
            </div>

            <LoginButton />
          </div>
        </div>
      </form>

      <p className="text-caption text-muted-foreground text-pretty">
        ¿No tenés cuenta? El alta la hace un administrador de tu empresa.
      </p>
    </div>
  );
}
