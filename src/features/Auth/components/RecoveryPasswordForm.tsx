'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/features/Auth/actions/auth-actions';
import { recoveryPassSchema } from '@/shared/schemas/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

type RecoveryValues = z.infer<typeof recoveryPassSchema>;

/**
 * Pedido de recuperación de contraseña. La respuesta es la misma exista o no la cuenta (no
 * revela qué correos están dados de alta), y se muestra en pantalla, no en un toast.
 */
export function RecoveryPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<RecoveryValues>({
    resolver: zodResolver(recoveryPassSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (values: RecoveryValues) => {
    startTransition(async () => {
      const result = await resetPasswordAction(values.email);
      if (result.success) {
        setSentTo(values.email);
        return;
      }
      form.setError('root', { message: result.error });
    });
  };

  if (sentTo) {
    return (
      <div className="space-y-6">
        <Alert variant="success" role="status">
          <MailCheck />
          <AlertTitle>Enlace enviado</AlertTitle>
          <AlertDescription>
            Si <span className="font-mono">{sentTo}</span> tiene una cuenta, en unos minutos recibís un correo con el
            enlace. Revisá también la carpeta de spam.
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setSentTo(null)}>
          Volver a enviar
        </Button>
        <BackToLogin />
      </div>
    );
  }

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

        <Button type="submit" size="lg" className="w-full" disabled={isPending} aria-busy={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" />
              Enviando…
            </>
          ) : (
            'Enviar enlace'
          )}
        </Button>

        <BackToLogin />
      </form>
    </Form>
  );
}

function BackToLogin() {
  return (
    <p className="text-muted-foreground border-t pt-5 text-sm">
      <Link href="/login" className="text-brand-ink font-medium hover:underline">
        ← Volver a ingresar
      </Link>
    </p>
  );
}
