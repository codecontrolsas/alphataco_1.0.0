'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createSalesPoint, updateSalesPoint } from '../actions/sales-points.server';
import type { FiscalDataOverview } from '../lib/fiscal-data-overview.server';
import { salesPointSchema, type SalesPointValues } from '../schemas/fiscal-data';
import { formatSalesPointNumber } from '../utils/format';

type SalesPoint = FiscalDataOverview['salesPoints'][number];

/**
 * Alta y edición de un punto de venta en un único Dialog (no encadena nada). Se monta al abrir,
 * así los `defaultValues` salen del punto elegido sin sincronizar con efectos.
 */
export function SalesPointFormDialog({
  salesPoint,
  onClose,
  onSaved,
}: {
  /** `null` = alta. */
  salesPoint: SalesPoint | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = salesPoint !== null;
  const form = useForm<SalesPointValues>({
    resolver: zodResolver(salesPointSchema),
    defaultValues: { number: salesPoint?.number, name: salesPoint?.name ?? '' },
  });
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: SalesPointValues) {
    const result = isEdit ? await updateSalesPoint(salesPoint.id, values) : await createSalesPoint(values);
    if (!result.ok) {
      form.setError('root', { message: result.error });
      return;
    }
    const label = formatSalesPointNumber(values.number);
    toast.success(isEdit ? `Punto de venta ${label} actualizado.` : `Punto de venta ${label} agregado.`);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar punto de venta ${formatSalesPointNumber(salesPoint.number)}` : 'Agregar punto de venta'}
          </DialogTitle>
          <DialogDescription>
            Tiene que estar dado de alta en ARCA como punto de venta de Factura electrónica – Web Services (no
            &quot;Factura en línea&quot;).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={5}
                      placeholder="3"
                      className="tabular-nums"
                    />
                  </FormControl>
                  <FormDescription>Entre 1 y 99999, el mismo número que tiene en ARCA.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre interno</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" placeholder="Casa central" />
                  </FormControl>
                  <FormDescription>Para reconocerlo en el sistema; no se informa a ARCA.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root?.message && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={submitting}>
                {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar punto de venta'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
