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
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { rejectOwnCheck } from '../../actions/own-checks.server';
import { invalidateTreasury } from '../../lib/invalidate';
import { treasuryToday } from '../../lib/today';
import { rejectOwnCheckSchema, type RejectOwnCheckValues } from '../../schemas/own-checks';

const logger = new Logger('Treasury/RejectOwnCheckDialog');

interface RejectOwnCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  check: { id: string; number: string; supplierName: string | null };
}

/** Rechazo de un cheque propio emitido (spec Tesorería etapa 3b §3.4): no mueve plata y vuelve la deuda con el proveedor. */
export function RejectOwnCheckDialog({ open, onOpenChange, check }: RejectOwnCheckDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<RejectOwnCheckValues>({
    resolver: zodResolver(rejectOwnCheckSchema),
    defaultValues: { date: treasuryToday(), reason: '' },
  });

  const save = useMutation({
    mutationFn: async (values: RejectOwnCheckValues) => unwrapAction(await rejectOwnCheck(check.id, values)),
    onSuccess: () => {
      toast.success('Rechazo registrado');
      invalidateTreasury(queryClient);
      router.refresh();
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al registrar el rechazo', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el rechazo');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rechazo del cheque Nº {check.number}</DialogTitle>
          <DialogDescription>
            El banco no lo pagó: no sale plata de la cuenta y la empresa vuelve a deberle el importe
            {check.supplierName ? ` a ${check.supplierName}` : ' al proveedor'}. Se paga con otra orden de pago.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Fecha del rechazo</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                      setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                      placeholder="DD/MM/AAAA"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Sin fondos, firma no coincide…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={save.isPending}>
                {save.isPending ? 'Registrando…' : 'Registrar rechazo'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
