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
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { rejectPreEmployee } from '../actions/pre-employee-actions.server';
import { rejectPreEmployeeSchema, type RejectPreEmployeeValues } from '../schemas/pre-employee-schema';

const logger = new Logger('PreLegajos/RejectDialog');

interface RejectPreEmployeeDialogProps {
  preEmployeeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRejected?: () => void;
}

/** Rechazo de un candidato. El motivo es obligatorio (requisito del ticket 505). */
export function RejectPreEmployeeDialog({
  preEmployeeId,
  open,
  onOpenChange,
  onRejected,
}: RejectPreEmployeeDialogProps) {
  const form = useForm<RejectPreEmployeeValues>({
    resolver: zodResolver(rejectPreEmployeeSchema),
    defaultValues: { rejection_reason: '' },
  });

  const onSubmit = async (values: RejectPreEmployeeValues) => {
    try {
      await rejectPreEmployee(preEmployeeId, values.rejection_reason);
      toast.success('Candidato rechazado');
      form.reset();
      onOpenChange(false);
      onRejected?.();
    } catch (error) {
      logger.error('Error al rechazar el candidato', { data: { error, preEmployeeId } });
      // Si el servidor devolvió un mensaje claro se muestra tal cual; nunca el objeto crudo de Prisma.
      toast.error(error instanceof Error && error.message ? error.message : 'No se pudo rechazar el candidato');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar candidato</DialogTitle>
          <DialogDescription>
            El postulante queda registrado como rechazado. Para poder ingresarlo más adelante hay que reabrirlo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rejection_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo del rechazo *</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="Explicá por qué se rechaza el ingreso" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Rechazando...' : 'Confirmar rechazo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
