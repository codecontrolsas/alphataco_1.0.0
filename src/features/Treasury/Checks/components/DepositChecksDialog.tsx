'use client';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Logger } from '@/lib/logger';
import { InputFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import moment from 'moment';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { depositChecks } from '../../actions/checks.server';
import type { CheckOperationFormData } from '../../lib/check-types';
import { minCreditDate } from '../../lib/checks-dates';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { useTreasuryMutation } from '../../lib/use-treasury-mutation';
import { depositSchema, type DepositValues } from '../../schemas/checks';
import { CheckOperationShell } from './CheckOperationShell';

const logger = new Logger('Treasury/DepositChecksDialog');

const toDate = (value: string) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const fromDate = (value: Date | undefined) => (value ? moment(value).format('YYYY-MM-DD') : '');

interface DepositChecksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cheques tildados en la cartera. */
  checkIds: string[];
  onDone?: () => void;
}

/** Boleta de depósito de cheques de la cartera (spec Tesorería etapa 3a §3.3). */
export function DepositChecksDialog({ open, onOpenChange, checkIds, onDone }: DepositChecksDialogProps) {
  return (
    <CheckOperationShell
      open={open}
      onOpenChange={onOpenChange}
      checkIds={checkIds}
      title="Depositar cheques"
      description="Salen de la cartera hoy y entran al banco en su fecha de acreditación."
    >
      {(data) => (
        <DepositForm
          key={data.checks.map((c) => c.id).join(',')}
          data={data}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      )}
    </CheckOperationShell>
  );
}

function DepositForm({
  data,
  onClose,
  onDone,
}: {
  data: CheckOperationFormData;
  onClose: () => void;
  onDone?: () => void;
}) {
  const form = useForm<DepositValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      bankAccountId: data.banks.length === 1 ? data.banks[0]!.id : '',
      date: data.today,
      slipNumber: '',
      items: data.checks.map((c) => ({ checkId: c.id, creditedOn: minCreditDate(data.today, c.paymentDate) })),
    },
  });
  const items = useWatch({ control: form.control, name: 'items' });
  const total = data.checks.reduce((acc, c) => acc + (parseScaled(c.amount, AMOUNT_SCALE) ?? BigInt(0)), BigInt(0));

  const save = useTreasuryMutation({
    action: (values: DepositValues) => depositChecks(values),
    onSuccess: (result) => {
      toast.success(
        `Depósito ${result.number} registrado: ${data.checks.length} ${data.checks.length === 1 ? 'cheque' : 'cheques'}`
      );
      onDone?.();
      onClose();
    },
    logger,
    logError: 'Error al depositar cheques',
    errorFallback: 'No se pudo registrar el depósito',
  });

  /** Al cambiar la fecha del depósito, ninguna acreditación queda antes de su mínimo. */
  const changeDate = (date: string) => {
    form.setValue('date', date, { shouldValidate: form.formState.isSubmitted });
    if (!date) return;
    data.checks.forEach((c, i) => {
      const min = minCreditDate(date, c.paymentDate);
      if ((form.getValues(`items.${i}.creditedOn`) ?? '') < min) form.setValue(`items.${i}.creditedOn`, min);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="bankAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cuenta bancaria</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí la cuenta" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {data.banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha del depósito</FormLabel>
                <FormControl>
                  <EnhancedDatePicker
                    date={toDate(field.value)}
                    setDate={(d) => changeDate(fromDate(d))}
                    placeholder="DD/MM/AAAA"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <InputFormField control={form.control} name="slipNumber" label="Boleta (opcional)" />
        </div>

        <ul className="divide-y rounded-md border">
          {data.checks.map((c, i) => (
            <li key={c.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  Nº {c.number} · {c.bank}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.drawerName} · pago {formatDay(c.paymentDate)} ·{' '}
                  <span className="tabular-nums">{formatInCurrency(c.amount, 'ARS')}</span>
                </p>
              </div>
              <FormField
                control={form.control}
                name={`items.${i}.creditedOn`}
                render={({ field }) => (
                  <FormItem className="sm:w-48">
                    <FormLabel className="text-xs">Acreditación</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={toDate(field.value ?? items?.[i]?.creditedOn ?? '')}
                        setDate={(d) => field.onChange(fromDate(d))}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </li>
          ))}
        </ul>
        {form.formState.errors.items?.message && (
          <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm">
            Total{' '}
            <span className="font-semibold tabular-nums">
              {formatInCurrency(formatScaled(total, AMOUNT_SCALE), 'ARS')}
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Depositando…' : 'Depositar'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
