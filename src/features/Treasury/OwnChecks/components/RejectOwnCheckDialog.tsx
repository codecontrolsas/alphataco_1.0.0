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
import { Form } from '@/components/ui/form';
import { Logger } from '@/lib/logger';
import { DateFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { rejectOwnCheck } from '../../actions/own-checks.server';
import { treasuryToday } from '../../lib/today';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { rejectOwnCheckSchema, type RejectOwnCheckValues } from '../../schemas/own-checks';

const logger = new Logger('Treasury/RejectOwnCheckDialog');

interface RejectOwnCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  check: { id: string; number: string; supplierName: string | null };
}

/** Rechazo de un cheque propio emitido (spec Tesorería etapa 3b §3.4): no mueve plata y vuelve la deuda con el proveedor. */
export function RejectOwnCheckDialog({ open, onOpenChange, check }: RejectOwnCheckDialogProps) {
  const form = useForm<RejectOwnCheckValues>({
    resolver: zodResolver(rejectOwnCheckSchema),
    defaultValues: { date: treasuryToday(), reason: '' },
  });

  const save = useTreasuryMutation({
    action: (values: RejectOwnCheckValues) => rejectOwnCheck(check.id, values),
    onSuccess: () => {
      toast.success('Rechazo registrado');
      onOpenChange(false);
    },
    logger,
    logError: 'Error al registrar el rechazo',
    errorFallback: 'No se pudo registrar el rechazo',
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
            <DateFormField control={form.control} name="date" label="Fecha del rechazo" itemClassName="max-w-xs" />
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
