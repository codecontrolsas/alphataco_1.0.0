'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { updatePasswordAction } from '@/features/Auth/actions/auth-actions';
import { changePassSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { PasswordInput } from './PasswordInput';

type ChangePassValues = z.infer<typeof changePassSchema>;

/**
 * Cierra el flujo de recuperación (y el de invitación, que usa el mismo tipo de token).
 *
 * El token llega por la URL: el enlace del mail apunta a `/api/auth/reset-password/<token>`,
 * que lo valida y redirige a la página con `?token=`. La página se lo pasa a este formulario.
 */
export function UpdateUserPasswordForm({
  token,
  redirectTo = '/login?reset=ok',
}: {
  token: string;
  /** Adónde ir al guardar. El portal de empleados lo usa para volver a `/portal/login`. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ChangePassValues>({
    resolver: zodResolver(changePassSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = (values: ChangePassValues) => {
    startTransition(async () => {
      const result = await updatePasswordAction(values.password, token);
      if (result.success) {
        router.replace(redirectTo);
        return;
      }
      form.setError('root', { message: result.error });
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        {form.formState.errors.root?.message && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle className="line-clamp-none">{form.formState.errors.root.message}</AlertTitle>
            <AlertDescription>Si el enlace venció, pedí uno nuevo desde “¿La olvidaste?”.</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña nueva</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" autoFocus />
              </FormControl>
              <FormDescription>Mínimo 8 caracteres, con mayúscula, minúscula y número.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repetí la contraseña</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="lg" className="w-full" disabled={isPending} aria-busy={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" />
              Guardando…
            </>
          ) : (
            'Guardar contraseña'
          )}
        </Button>
      </form>
    </Form>
  );
}
