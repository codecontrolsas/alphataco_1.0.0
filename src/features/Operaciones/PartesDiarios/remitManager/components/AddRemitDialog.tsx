'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, FileText, Info, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateRemito } from '../hooks/useRemitos';
import { AddRemitDialogProps } from '../types';

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

export function AddRemitDialog({
  dailyReportRowId,
  isOpen,
  onClose,
  existingNumbers,
  onRemitoCreated,
}: AddRemitDialogProps) {
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Agregar Nuevo Remito</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">Complete los datos para crear un nuevo remito</p>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            <FormField
              control={form.control}
              name="remitNumber"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-semibold">
                    Número de Remito <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ej: 12345 o ABC-001"
                      autoFocus
                      disabled={isBusy}
                      className="text-base h-11"
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

            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                Podrá agregar y gestionar documentos después de crear el remito.
              </AlertDescription>
            </Alert>

            <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isBusy}
                className="flex-1 sm:flex-none"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy} className="flex-1 sm:flex-none">
                {isBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear Remito
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
