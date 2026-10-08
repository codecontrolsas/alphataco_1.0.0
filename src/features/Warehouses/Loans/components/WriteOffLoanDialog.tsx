'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { writeOffLoanedUnitAction } from '../../actions/loans.server';
import { WRITE_OFF_REASON_LABELS } from '../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { writeOffLoanSchema, type WriteOffLoanFormValues } from '../../schemas/loans';

const logger = new Logger('Warehouses/WriteOffLoanDialog');

interface WriteOffLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  serialNumber: string;
  materialName: string;
  holder: string | null;
}

/**
 * Baja de una herramienta prestada que no vuelve. No mueve stock: la herramienta ya habia
 * salido y su costo queda imputado a quien la tenia.
 */
export function WriteOffLoanDialog({ open, onOpenChange, unitId, serialNumber, materialName, holder }: WriteOffLoanDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<WriteOffLoanFormValues>({
    resolver: zodResolver(writeOffLoanSchema),
    defaultValues: { unitId, reason: 'LOST', notes: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: WriteOffLoanFormValues) => unwrapAction(await writeOffLoanedUnitAction(values)),
    onSuccess: (result) => {
      toast.success(`${result.serialNumber} dada de baja`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.loans });
      router.refresh();
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error al dar de baja la herramienta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja la herramienta');
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Dar de baja {serialNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            {materialName}
            {holder ? `, en poder de ${holder}` : ''}. El préstamo se cierra y la herramienta deja de figurar; queda
            registrado quién la tenía. No se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                      {(['LOST', 'BROKEN'] as const).map((reason) => (
                        <div key={reason} className="flex items-center gap-2">
                          <RadioGroupItem value={reason} id={`write-off-${reason}`} />
                          <Label htmlFor={`write-off-${reason}`} className="font-normal">
                            {WRITE_OFF_REASON_LABELS[reason]}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qué pasó</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Ej.: se perdió en la locación del pozo 12" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={mutation.isPending}>
                Cancelar
              </AlertDialogCancel>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {mutation.isPending ? 'Procesando…' : 'Dar de baja'}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
