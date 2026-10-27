'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { changePassword } from '@/features/Auth/actions/change-password';
import { PasswordInput } from '@/features/Auth/components/PasswordInput';
import { changePassSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

type Values = z.infer<typeof changePassSchema>;

/**
 * Primer ingreso con contraseña temporal: el portal no muestra nada más hasta que la cambie (el perímetro del servidor
 * también lo exige en cada action). Al guardar, la sesión baja `needsPasswordChange` y la página se recarga.
 */
export function ForcedPasswordChange() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(changePassSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = (values: Values) => {
    startTransition(async () => {
      const result = await changePassword(values.password);
      if (!result.success) {
        form.setError('root', { message: result.error ?? 'No se pudo cambiar la contraseña.' });
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Elegí tu contraseña</h1>
        <p className="text-muted-foreground text-pretty">
          Entraste con una contraseña temporal. Para seguir, elegí una nueva que solo sepas vos.
        </p>
      </div>
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
          <Button type="submit" size="lg" className="min-h-11 w-full" disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {isPending ? 'Guardando…' : 'Guardar y entrar'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
