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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Logger } from '@/lib/logger';
import { DateFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { rejectCheck } from '../../actions/checks.server';
import { treasuryToday } from '../../lib/today';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { RETURNED_BY, RETURNED_BY_LABELS, rejectionSchema, type RejectionValues } from '../../schemas/checks';

const logger = new Logger('Treasury/RejectCheckDialog');

interface RejectCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  check: { id: string; number: string; bank: string; status: string };
}

/** Rechazo de un cheque depositado, endosado o descontado (spec Tesorería etapa 3a §3.6). */
export function RejectCheckDialog({ open, onOpenChange, check }: RejectCheckDialogProps) {
  const form = useForm<RejectionValues>({
    resolver: zodResolver(rejectionSchema),
    defaultValues: {
      checkId: check.id,
      date: treasuryToday(),
      reason: '',
      returnedBy: check.status === 'ENDORSED' ? 'SUPPLIER' : 'BANK',
    },
  });

  const save = useTreasuryMutation({
    action: (values: RejectionValues) => rejectCheck(values),
    onSuccess: (result) => {
      toast.success(`Rechazo ${result.number} registrado`);
      onOpenChange(false);
    },
    logger,
    logError: 'Error al registrar el rechazo',
    errorFallback: 'No se pudo registrar el rechazo',
  });

  const effect =
    check.status === 'ENDORSED'
      ? 'El cliente vuelve a deber el cheque y la empresa vuelve a deberle al proveedor.'
      : 'Sale el importe del banco donde entró y el cliente vuelve a deber el cheque.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Rechazo del cheque Nº {check.number} · {check.bank}
          </DialogTitle>
          <DialogDescription>{effect}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <DateFormField control={form.control} name="date" label="Fecha del rechazo" />
            <FormField
              control={form.control}
              name="returnedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lo devolvió</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                      {RETURNED_BY.map((value) => (
                        <FormItem key={value} className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value={value} />
                          </FormControl>
                          <FormLabel className="font-normal">{RETURNED_BY_LABELS[value]}</FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <TextareaFormField
              control={form.control}
              name="reason"
              label="Motivo"
              rows={3}
              placeholder="Sin fondos, firma no coincide…"
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
