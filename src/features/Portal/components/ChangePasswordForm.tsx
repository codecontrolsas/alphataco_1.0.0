'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PasswordInput } from '@/features/Auth/components/PasswordInput';
import { changePortalPassword } from '@/features/Portal/actions/session.server';
import { passwordSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu contraseña actual.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

type Values = z.infer<typeof schema>;

/** Cambio voluntario de contraseña desde "Perfil" (pide la actual). */
export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  const onSubmit = (values: Values) => {
    startTransition(async () => {
      const result = await changePortalPassword(values.currentPassword, values.password);
      if (!result.success) {
        form.setError('root', { message: result.error });
        return;
      }
      form.reset();
      toast.success('Contraseña actualizada. Cerramos tus otras sesiones abiertas.');
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        {form.formState.errors.root?.message && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle className="line-clamp-none">{form.formState.errors.root.message}</AlertTitle>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña actual</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="current-password" />
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
              <FormLabel>Contraseña nueva</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" />
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
              <FormLabel>Repetí la contraseña nueva</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="min-h-11" disabled={isPending} aria-busy={isPending}>
          {isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </Form>
  );
}
