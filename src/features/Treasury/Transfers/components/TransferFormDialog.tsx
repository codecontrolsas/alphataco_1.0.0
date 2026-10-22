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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Logger } from '@/lib/logger';
import { DateFormField, InputFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import { createTransfer } from '../../actions/transfers.server';
import { BalancePreview } from '../../components/BalancePreview';
import { NegativeCashConfirm } from '../../components/NegativeCashConfirm';
import { useBalanceAfter } from '../../hooks/useBalanceAfter';
import { treasuryToday } from '../../lib/today';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { transferFormSchema, type TransferFormValues } from '../../schemas/transfers';

const logger = new Logger('Treasury/TransferFormDialog');

interface TransferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuentas activas con su saldo. */
  accounts: TreasuryAccountRow[];
  defaultFromAccountId?: string;
}

/**
 * Transferencia entre dos cuentas o cajas (spec Tesorería etapa 1 §3): origen, destino (sin la de
 * origen), fecha, importe y notas, con el saldo de las dos a la vista. Si la caja de origen queda
 * en negativo pide confirmar. Se monta al abrirse.
 */
export function TransferFormDialog({ open, onOpenChange, accounts, defaultFromAccountId }: TransferFormDialogProps) {
  const [confirmNegative, setConfirmNegative] = useState<TransferFormValues | null>(null);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountId: defaultFromAccountId ?? '',
      toAccountId: '',
      date: treasuryToday(),
      amount: '',
      notes: '',
    },
  });

  const [fromId, toId, date, amount] = useWatch({
    control: form.control,
    name: ['fromAccountId', 'toAccountId', 'date', 'amount'],
  });
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const cents = parseScaled(amount, AMOUNT_SCALE);
  const delta = cents !== null && cents > BigInt(0) ? cents : null;
  const fromPreview = useBalanceAfter(fromId, date, delta === null ? null : -delta);
  const toPreview = useBalanceAfter(toId, date, delta);

  const save = useTreasuryMutation({
    action: (values: TransferFormValues) => createTransfer(values),
    onSuccess: (data) => {
      toast.success(`Transferencia ${data.number} registrada`);
      setConfirmNegative(null);
      onOpenChange(false);
    },
    logger,
    logError: 'Error al registrar la transferencia',
    errorFallback: 'No se pudo registrar la transferencia',
    onFailure: () => {
      setConfirmNegative(null);
    },
  });

  const onSubmit = (values: TransferFormValues) => {
    if (from?.kind === 'CASH' && fromPreview.after?.startsWith('-')) {
      setConfirmNegative(values);
      return;
    }
    save.mutate(values);
  };

  const accountSelect = (name: 'fromAccountId' | 'toAccountId', label: string, options: TreasuryAccountRow[]) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
              // El destino no puede ser la cuenta de origen.
              if (name === 'fromAccountId' && form.getValues('toAccountId') === value) form.setValue('toAccountId', '');
            }}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Elegí la cuenta" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva transferencia</DialogTitle>
            <DialogDescription>
              Pasa plata de una cuenta o caja a otra. Genera un egreso en el origen y un ingreso en el destino.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {accountSelect('fromAccountId', 'Desde', accounts)}
                {accountSelect(
                  'toAccountId',
                  'Hacia',
                  accounts.filter((a) => a.id !== fromId)
                )}
                <DateFormField control={form.control} name="date" label="Fecha" />
                <InputFormField
                  control={form.control}
                  name="amount"
                  label="Importe"
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <InputFormField control={form.control} name="notes" label="Notas (opcional)" />
              <div className="space-y-2">
                {from && <BalancePreview accountName={from.name} date={date} preview={fromPreview} />}
                {to && <BalancePreview accountName={to.name} date={date} preview={toPreview} />}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <NegativeCashConfirm
        accountName={from?.name ?? ''}
        after={fromPreview.after}
        open={confirmNegative !== null}
        pending={save.isPending}
        onCancel={() => setConfirmNegative(null)}
        onConfirm={() => confirmNegative && save.mutate(confirmNegative)}
      />
    </>
  );
}
