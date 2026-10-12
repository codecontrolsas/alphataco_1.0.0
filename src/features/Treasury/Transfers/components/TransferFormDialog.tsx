'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import { createTransfer } from '../../actions/transfers.server';
import { BalancePreview } from '../../components/BalancePreview';
import { NegativeCashConfirm } from '../../components/NegativeCashConfirm';
import { useBalanceAfter } from '../../hooks/useBalanceAfter';
import { invalidateTreasury } from '../../lib/invalidate';
import { transferFormSchema, type TransferFormValues } from '../../schemas/transfers';
import { treasuryToday } from '../../lib/today';

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmNegative, setConfirmNegative] = useState<TransferFormValues | null>(null);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: { fromAccountId: defaultFromAccountId ?? '', toAccountId: '', date: treasuryToday(), amount: '', notes: '' },
  });

  const [fromId, toId, date, amount] = useWatch({ control: form.control, name: ['fromAccountId', 'toAccountId', 'date', 'amount'] });
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const cents = parseScaled(amount, AMOUNT_SCALE);
  const delta = cents !== null && cents > BigInt(0) ? cents : null;
  const fromPreview = useBalanceAfter(fromId, date, delta === null ? null : -delta);
  const toPreview = useBalanceAfter(toId, date, delta);

  const save = useMutation({
    mutationFn: async (values: TransferFormValues) => unwrapAction(await createTransfer(values)),
    onSuccess: (data) => {
      toast.success(`Transferencia ${data.number} registrada`);
      setConfirmNegative(null);
      onOpenChange(false);
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al registrar la transferencia', { data: { error } });
      setConfirmNegative(null);
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la transferencia');
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
            <DialogDescription>Pasa plata de una cuenta o caja a otra. Genera un egreso en el origen y un ingreso en el destino.</DialogDescription>
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
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
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
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Importe</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" placeholder="0,00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
