'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { loginSchema, type LoginValues } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { LoginSubmitButton } from './LoginSubmitButton';
import { PasswordInput } from './PasswordInput';

interface CredentialsLoginFormProps {
  /** Server Action que autentica y valida que el usuario sirva para este acceso. */
  action: (email: string, password: string) => Promise<{ error?: string; success?: boolean }>;
  /** Ruta a la que se va al ingresar. */
  redirectTo: string;
  /** Qué hacer si no tiene acceso (se muestra al pie). */
  helpText: string;
}

/**
 * Formulario de los accesos acotados (panel de operario, entrega de indumentaria): mismo
 * formulario, otra Server Action y otro destino. Antes eran dos copias de ~150 líneas.
 */
export function CredentialsLoginForm({ action, redirectTo, helpText }: CredentialsLoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginValues) => {
    startTransition(async () => {
      const result = await action(values.email, values.password);
      if (result.error) {
        form.setError('root', { message: result.error });
        form.resetField('password');
        return;
      }
      router.replace(redirectTo);
    });
  };

  return (
    <div className="space-y-6">
      {form.formState.errors.root?.message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle className="line-clamp-none">{form.formState.errors.root.message}</AlertTitle>
        </Alert>
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
                <FormLabel>Contraseña</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="current-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <LoginSubmitButton isPending={isPending} />
        </form>
      </Form>

      <p className="text-muted-foreground border-t pt-5 text-sm text-pretty">{helpText}</p>
    </div>
  );
}
