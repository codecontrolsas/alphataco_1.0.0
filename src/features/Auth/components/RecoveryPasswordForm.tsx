'use client';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/features/Auth/actions/auth-actions';
import { recoveryPassSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export const RecoveryPasswordForm = () => {
  const [showLoader, setShowLoader] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<z.infer<typeof recoveryPassSchema>>({
    resolver: zodResolver(recoveryPassSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof recoveryPassSchema>) => {
    setShowLoader(true);

    toast.promise(resetPasswordAction(values.email), {
      loading: 'Enviando enlace de recuperación...',
      success: (result) => {
        if (result.success) {
          setEmailSent(true);
          return 'Si existe una cuenta con ese email, recibirás un correo con instrucciones seguras para restablecer tu contraseña.';
        } else {
          throw new Error(result.error);
        }
      },
      error: (error) => {
        return error.message || 'Error al enviar el email de recuperación';
      },
      finally: () => {
        setShowLoader(false);
      },
    });
  };

  if (emailSent) {
    return (
      <div role="status" className="space-y-2 border border-success-border bg-success-soft px-3 py-2.5">
        <div className="text-label text-success-text">✓ Solicitud enviada exitosamente</div>
        <p className="text-caption text-foreground/80">
          Hemos enviado un enlace seguro a <strong>{form.getValues('email')}</strong>. Revisa tu bandeja de entrada y
          sigue las instrucciones para restablecer tu contraseña.
        </p>
        <p className="text-caption text-muted-foreground">
          ¿No recibiste el email?{' '}
          <button
            type="button"
            onClick={() => setEmailSent(false)}
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Reenviar
          </button>
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  className="h-10"
                  placeholder="email@hotmail.com"
                  type="email"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Ingresa tu email para recibir un enlace seguro y recuperar tu contraseña.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={showLoader} className="w-full">
          {showLoader ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            'Enviar enlace de recuperación'
          )}
        </Button>

        <div className="text-caption text-muted-foreground">
          <p>
            ¿Recordaste tu contraseña?{' '}
            <a href="/login" className="font-medium text-primary-text underline-offset-4 hover:underline">
              Iniciar sesión
            </a>
          </p>
        </div>
      </form>
    </Form>
  );
};
