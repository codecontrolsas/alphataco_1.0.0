'use client';

import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clipboard, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { buildCredentialsSchema, type CredentialsValues, type MaintenanceLoginType } from '../utils/login-schemas';

interface CredentialsStepProps {
  loginType: MaintenanceLoginType;
  onSubmit: (values: CredentialsValues) => Promise<void>;
}

/**
 * Paso 3: credenciales. El empleado ingresa su CUIL; el invitado, email y contraseña.
 */
export function CredentialsStep({ loginType, onSubmit }: CredentialsStepProps) {
  const schema = useMemo(() => buildCredentialsSchema(loginType), [loginType]);

  const form = useForm<CredentialsValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', cuil: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <CardDescription className="mb-4 text-center text-base text-foreground">
          {loginType === 'empleado'
            ? 'Ingrese su CUIL para acceder al sistema de mantenimiento.'
            : 'Ingrese sus credenciales para acceder al sistema de mantenimiento.'}
        </CardDescription>
        {loginType === 'empleado' ? (
          <div className="space-y-2">
            <FormField
              control={form.control}
              name="cuil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuil</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ingrese su Cuil"
                      inputMode="numeric"
                      autoComplete="off"
                      className="h-12 text-base tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : (
          <>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="Ingrese su correo"
                      className="h-12 text-base"
                      {...field}
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
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Ingrese su contraseña"
                      className="h-12 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <Button type="submit" className="h-12 w-full text-base" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Clipboard aria-hidden="true" className="mr-2 h-4 w-4" />
          )}
          {form.formState.isSubmitting ? 'Ingresando…' : 'Acceder al Sistema'}
        </Button>
      </form>
    </Form>
  );
}
