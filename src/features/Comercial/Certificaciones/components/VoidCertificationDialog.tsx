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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { voidCertificationSchema, type VoidCertificationValues } from '../schemas/certification';

interface VoidCertificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Número a mostrar en el título. */
  number: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
}

/** Anulación: el motivo es obligatorio y queda guardado. Cerrar sin confirmar descarta lo escrito. */
export function VoidCertificationDialog({
  open,
  onOpenChange,
  number,
  pending,
  onConfirm,
}: VoidCertificationDialogProps) {
  const form = useForm<VoidCertificationValues>({
    resolver: zodResolver(voidCertificationSchema),
    defaultValues: { reason: '' },
  });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Anular certificación {number}</DialogTitle>
          <DialogDescription>
            Una certificación emitida no se modifica: se anula y se emite otra. El motivo queda guardado.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => onConfirm(values.reason))} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Por qué se anula" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                Anular
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
