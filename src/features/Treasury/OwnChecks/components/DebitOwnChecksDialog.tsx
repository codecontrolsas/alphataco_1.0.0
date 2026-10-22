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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AMOUNT_SCALE, amountOf, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Logger } from '@/lib/logger';
import { DateFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { debitOwnChecks } from '../../actions/own-checks.server';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { treasuryToday } from '../../lib/today';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { debitOwnChecksSchema, type DebitOwnChecksValues } from '../../schemas/own-checks';

const logger = new Logger('Treasury/DebitOwnChecksDialog');

const dmy = (value: string | null) => formatDay(value) || '—';

export type DebitableOwnCheck = {
  id: string;
  number: string;
  amount: string;
  paymentDate: string | null;
  accountName: string;
};

interface DebitOwnChecksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: DebitableOwnCheck[];
  /** Después de confirmar (por ejemplo, limpiar la selección de la tabla). */
  onDone?: () => void;
}

/**
 * Confirmar el débito de uno o varios cheques propios emitidos (spec Tesorería etapa 3b §3.3): una
 * sola fecha, que no puede ser futura ni anterior a la fecha de pago de ninguno. Con un solo
 * cheque arranca en su fecha de pago; con varios, en hoy.
 */
export function DebitOwnChecksDialog({ open, onOpenChange, checks, onDone }: DebitOwnChecksDialogProps) {
  const today = treasuryToday();
  const single = checks.length === 1 ? checks[0] : null;
  const defaultDate = single?.paymentDate && single.paymentDate <= today ? single.paymentDate : today;
  const form = useForm<DebitOwnChecksValues>({
    resolver: zodResolver(debitOwnChecksSchema),
    values: { checkIds: checks.map((c) => c.id), date: defaultDate },
  });
  const total = formatScaled(
    checks.reduce((acc, c) => acc + amountOf(c.amount), BigInt(0)),
    AMOUNT_SCALE
  );

  const save = useTreasuryMutation({
    action: (values: DebitOwnChecksValues) => debitOwnChecks(values),
    onSuccess: (result) => {
      toast.success(result.count === 1 ? 'Débito confirmado' : `Débito confirmado de ${result.count} cheques`);
      onOpenChange(false);
      onDone?.();
    },
    logger,
    logError: 'Error al confirmar el débito',
    errorFallback: 'No se pudo confirmar el débito',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {single
              ? `Confirmar el débito del cheque Nº ${single.number}`
              : `Confirmar el débito de ${checks.length} cheques`}
          </DialogTitle>
          <DialogDescription>
            El importe sale de la cuenta en la fecha del débito. Si el banco todavía no lo pagó, dejalo emitido.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            {!single && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cheque</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Fecha de pago</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checks.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">Nº {c.number}</TableCell>
                        <TableCell>{c.accountName}</TableCell>
                        <TableCell className="tabular-nums">{dmy(c.paymentDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInCurrency(c.amount, 'ARS')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-sm">
              Total <span className="font-semibold tabular-nums">{formatInCurrency(total, 'ARS')}</span>
            </p>
            <DateFormField control={form.control} name="date" label="Fecha del débito" itemClassName="max-w-xs" />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending || checks.length === 0}>
                {save.isPending ? 'Confirmando…' : 'Confirmar débito'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
