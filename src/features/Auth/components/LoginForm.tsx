'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { login } from '@/features/Auth/actions/login-actions';
import { loginSchema, type LoginValues } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CircleCheck, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import GoogleButton from './GoogleButton';
import { PasswordInput } from './PasswordInput';

interface LoginFormProps {
  /** Ruta interna a la que ir después de ingresar (ya validada por el servidor). */
  next: string;
  /** `googleLogin()` manda a `/login?error=oauth` cuando el callback de Google falla. */
  oauthFailed?: boolean;
  /** Botón de Google: opcional por instancia (ver `showGoogleLoginButton`). */
  showGoogle?: boolean;
  /** Llegó desde "Guardar contraseña": avisa que ya puede ingresar con la nueva. */
  passwordUpdated?: boolean;
}

/**
 * Formulario de ingreso. Los errores de validación salen junto a cada campo y el rechazo del
 * servidor en un aviso fijo arriba del formulario (no en un toast que se va solo).
 */
export function LoginForm({ next, oauthFailed = false, showGoogle = false, passwordUpdated = false }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const rejection = form.formState.errors.root;

  const onSubmit = (values: LoginValues) => {
    startTransition(async () => {
      const result = await login(values);
      if ('success' in result) {
        // Sigue "pendiente" hasta que la navegación termina: el botón no se rehabilita a mitad de camino.
        router.replace(next);
        router.refresh();
        return;
      }
      form.setError('root', { type: result.code, message: result.error });
      if (result.code === 'invalid_credentials') form.resetField('password');
    });
  };

  return (
    <div className="space-y-6">
      {passwordUpdated && (
        <Alert variant="success" role="status">
          <CircleCheck />
          <AlertTitle className="line-clamp-none">Contraseña actualizada</AlertTitle>
          <AlertDescription>Ya podés ingresar con la nueva.</AlertDescription>
        </Alert>
      )}

      {oauthFailed && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>No pudimos entrar con Google</AlertTitle>
          <AlertDescription>
            Si es tu primera vez, pedile a un administrador de tu empresa que te dé de alta: el sistema no crea cuentas
            solo.
          </AlertDescription>
        </Alert>
      )}

      {rejection?.message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle className="line-clamp-none">{rejection.message}</AlertTitle>
          {rejection.type === 'invalid_credentials' && (
            <AlertDescription>
              Revisá los datos e intentá de nuevo. Si no la recordás, podés{' '}
              <Link href="/reset_password" className="text-foreground font-medium underline underline-offset-4">
                recuperarla
              </Link>
              .
            </AlertDescription>
          )}
        </Alert>
      )}

      {showGoogle && (
        <>
          <GoogleButton next={next} />
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
            <span className="bg-border h-px flex-1" />o con tu correo
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo electrónico</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="nombre@empresa.com"
                    autoFocus
                    data-testid="login-email-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-baseline justify-between">
                  <FormLabel>Contraseña</FormLabel>
                  <Link href="/reset_password" className="text-brand-ink text-sm font-medium hover:underline">
                    ¿La olvidaste?
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput {...field} autoComplete="current-password" data-testid="login-password-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending}
            aria-busy={isPending}
            data-testid="login-submit-button"
          >
            {isPending ? (
              <>
                <Loader2 className="animate-spin motion-reduce:animate-none" />
                Ingresando…
              </>
            ) : (
              'Ingresar'
            )}
          </Button>
        </form>
      </Form>

      <p className="text-muted-foreground border-t pt-5 text-sm text-pretty">
        ¿No tenés cuenta? El alta la hace un administrador de tu empresa.
      </p>
    </div>
  );
}
