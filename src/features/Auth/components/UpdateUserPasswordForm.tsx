'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CloseEyeIcon } from '@/components/ui/icons/closeEye';
import { EyeIcon } from '@/components/ui/icons/openEye';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { updatePasswordAction } from '@/features/Auth/actions/auth-actions';
import { changePassSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

/**
 * Cierra el flujo de recuperación (y el de invitación, que usa el mismo tipo de token).
 *
 * El token llega por la URL: el enlace del mail apunta a `/api/auth/reset-password/<token>`,
 * que lo valida y redirige acá con `?token=`. Si no viene, el formulario no se muestra.
 */
export const UpdateUserPasswordForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const tokenError = searchParams.get('error');

  const form = useForm<z.infer<typeof changePassSchema>>({
    resolver: zodResolver(changePassSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof changePassSchema>) => {
    setShowLoader(true);

    toast.promise(
      async () => {
        const result = await updatePasswordAction(values.password, token);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result;
      },
      {
        loading: 'Actualizando contraseña...',
        success: () => {
          router.push('/login');
          return 'Tu contraseña ha sido cambiada con éxito. Ya puedes iniciar sesión con tu nueva contraseña.';
        },
        error: (error) => {
          return error.message || 'Error al cambiar la contraseña';
        },
        finally: () => {
          setShowLoader(false);
        },
      }
    );
  };

  if (!token || tokenError) {
    return (
      <div className="border border-danger-border bg-danger-soft px-3 py-2.5">
        <p className="text-label text-danger-text">Enlace inválido o expirado</p>
        <p className="mt-1 text-caption text-foreground/80">Pedí un enlace nuevo desde “¿Olvidaste tu contraseña?”.</p>
        <a href="/reset_password" className={buttonVariants({ variant: 'primary', className: 'mt-4' })}>
          Solicitar nuevo enlace
        </a>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="contraseña segura"
                    autoComplete="new-password"
                    className="h-10"
                    {...field}
                  />
                </FormControl>
                <Toggle
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  variant={'outline'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <CloseEyeIcon /> : <EyeIcon />}
                </Toggle>
              </div>
              <FormDescription>Ingresa tu nueva contraseña.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar contraseña</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="contraseña segura"
                    autoComplete="new-password"
                    className="h-10"
                    {...field}
                  />
                </FormControl>
                <Toggle
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  variant={'outline'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <CloseEyeIcon /> : <EyeIcon />}
                </Toggle>
              </div>
              <FormDescription>Ingresa tu nueva contraseña otra vez.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={showLoader}>
          {showLoader ? 'Cambiando contraseña...' : 'Cambiar contraseña'}
        </Button>
      </form>
    </Form>
  );
};
