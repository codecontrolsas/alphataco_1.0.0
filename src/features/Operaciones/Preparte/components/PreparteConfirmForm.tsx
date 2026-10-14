'use client';

import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PreparteListItem } from '../list/actions.server';
import type { PreparteConfirmation } from '../list/columns';

const confirmFormSchema = z.object({
  confirmedBy: z.string().trim().min(1, 'Ingresá quién confirma'),
  executionDate: z.string(),
});

type ConfirmFormValues = z.infer<typeof confirmFormSchema>;

interface PreparteConfirmFormProps {
  item: PreparteListItem;
  onSubmit: (confirmation: PreparteConfirmation) => Promise<void> | void;
  onCancel: () => void;
  /** Texto del botón que cancela ("Volver" si el diálogo se abrió desde el detalle). */
  cancelLabel?: string;
}

/**
 * Contenido del diálogo de confirmación de un pedido (va dentro de un `DialogContent`).
 * Los pedidos vencidos piden además una fecha de ejecución nueva (hoy o posterior, hora argentina).
 */
export function PreparteConfirmForm({ item, onSubmit, onCancel, cancelLabel = 'Cancelar' }: PreparteConfirmFormProps) {
  const isExpired = item.status === 'vencido';
  const today = argentinaDate();

  const form = useForm<ConfirmFormValues>({
    resolver: zodResolver(confirmFormSchema),
    mode: 'onChange',
    defaultValues: { confirmedBy: '', executionDate: today },
  });

  const executionDate = form.watch('executionDate');
  const confirmedBy = form.watch('confirmedBy');
  const isSubmitting = form.formState.isSubmitting;

  const handleSubmit = async (values: ConfirmFormValues) => {
    await onSubmit({
      confirmedBy: values.confirmedBy.trim(),
      ...(isExpired ? { executionDate: values.executionDate } : {}),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isExpired ? 'Confirmar pedido vencido' : '¿Confirmar pedido?'}</DialogTitle>
        <DialogDescription>El pedido se enviará al parte diario correspondiente a la fecha de ejecución.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-4 py-4">
            {isExpired && (
              <FormField
                control={form.control}
                name="executionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de ejecución</FormLabel>
                    <FormControl>
                      <Input type="date" min={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="confirmedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmado por</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ingrese el nombre de quien confirma"
                      data-testid="confirmado-por-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              disabled={!confirmedBy.trim() || (isExpired && !executionDate) || isSubmitting}
              data-testid="confirmar-modal-button"
            >
              {isSubmitting ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
