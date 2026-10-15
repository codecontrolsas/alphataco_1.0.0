'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Info, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateRemito } from '../hooks/useRemitos';
import { AddRemitFormProps } from '../types';

/** Schema del formulario; la unicidad se valida contra los números ya cargados en la línea. */
function buildRemitSchema(existingNumbers: string[]) {
  return z.object({
    remitNumber: z
      .string()
      .trim()
      .min(1, 'El número de remito es requerido')
      .refine((value) => !existingNumbers.includes(value), 'Ya existe un remito con este número'),
  });
}

/** Alta de remito dentro del gestor (panel en línea, sin modal encima del modal). */
export function AddRemitForm({ dailyReportRowId, onClose, existingNumbers, onRemitoCreated }: AddRemitFormProps) {
  const createRemito = useCreateRemito(dailyReportRowId);

  const schema = useMemo(() => buildRemitSchema(existingNumbers), [existingNumbers]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { remitNumber: '' },
  });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    form.clearErrors('root');
    try {
      const newRemito = await createRemito.mutateAsync(values.remitNumber);
      onRemitoCreated?.(newRemito.id);
      handleClose();
    } catch {
      form.setError('root', { message: 'Error al crear el remito' });
    }
  };

  const rootError = form.formState.errors.root?.message;
  const isBusy = createRemito.isPending || form.formState.isSubmitting;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Nuevo remito</h3>
        <p className="text-muted-foreground text-sm">Datos para crear un remito en esta línea del parte.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="remitNumber"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-sm font-semibold">
                  Número de remito <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Ej: 12345 o ABC-001"
                    autoFocus
                    disabled={isBusy}
                    className="h-11 text-base"
                  />
                </FormControl>
                <FormDescription>Ingrese un número único que identifique este remito</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {rootError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{rootError}</AlertDescription>
            </Alert>
          )}

          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
              Podrá agregar y gestionar documentos después de crear el remito.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isBusy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear remito
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
