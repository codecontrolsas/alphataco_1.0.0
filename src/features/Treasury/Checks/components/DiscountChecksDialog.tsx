'use client';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Logger } from '@/lib/logger';
import { DateFormField, InputFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { discountChecks } from '../../actions/checks.server';
import { discountError, discountNet } from '../../lib/check-discount';
import type { CheckOperationFormData } from '../../lib/check-types';
import { formatInCurrency } from '../../lib/currency-format';
import { formatDay } from '../../lib/dates';
import { invalidateTreasury } from '../../lib/invalidate';
import { discountSchema, type DiscountValues } from '../../schemas/checks';
import { CheckOperationShell } from './CheckOperationShell';

const logger = new Logger('Treasury/DiscountChecksDialog');

const cents = (value: string) => parseScaled(value === '' ? '0' : value, AMOUNT_SCALE);
const pesos = (value: bigint) => formatInCurrency(formatScaled(value, AMOUNT_SCALE), 'ARS');

interface DiscountChecksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cheques tildados en la cartera. */
  checkIds: string[];
  onDone?: () => void;
}

/** Liquidación de un descuento de cheques en un banco (spec Tesorería etapa 3a §3.5). */
export function DiscountChecksDialog({ open, onOpenChange, checkIds, onDone }: DiscountChecksDialogProps) {
  return (
    <CheckOperationShell
      open={open}
      onOpenChange={onOpenChange}
      checkIds={checkIds}
      title="Descontar cheques"
      description="Salen de la cartera por su nominal y entra al banco el neto de intereses y comisión."
    >
      {(data) => (
        <DiscountForm
          key={data.checks.map((c) => c.id).join(',')}
          data={data}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      )}
    </CheckOperationShell>
  );
}

function DiscountForm({
  data,
  onClose,
  onDone,
}: {
  data: CheckOperationFormData;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<DiscountValues>({
    resolver: zodResolver(discountSchema),
    defaultValues: {
      bankAccountId: data.banks.length === 1 ? data.banks[0]!.id : '',
      date: data.today,
      interest: '',
      fee: '',
      reference: '',
      checkIds: data.checks.map((c) => c.id),
    },
  });
  const [interest, fee] = useWatch({ control: form.control, name: ['interest', 'fee'] });
  const interestCents = cents(interest);
  const feeCents = cents(fee);
  const { nominal, net } = discountNet({
    nominals: data.checks.map((c) => cents(c.amount) ?? BigInt(0)),
    interest: interestCents ?? BigInt(0),
    fee: feeCents ?? BigInt(0),
  });
  const netProblem = interestCents !== null && feeCents !== null ? discountError(net) : null;

  const save = useMutation({
    mutationFn: async (values: DiscountValues) => unwrapAction(await discountChecks(values)),
    onSuccess: (result) => {
      toast.success(`Descuento ${result.number} registrado: neto ${formatInCurrency(result.net, 'ARS')}`);
      invalidateTreasury(queryClient);
      router.refresh();
      onDone?.();
      onClose();
    },
    onError: (error) => {
      logger.error('Error al descontar cheques', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el descuento');
    },
  });

  const amountField = (name: 'interest' | 'fee', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input inputMode="decimal" placeholder="0,00" className="text-right tabular-nums" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
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
          <DateFormField control={form.control} name="date" label="Fecha de la liquidación" />
          {amountField('interest', 'Intereses')}
          {amountField('fee', 'Comisión')}
          <InputFormField
            control={form.control}
            name="reference"
            label="Referencia de la liquidación (opcional)"
            itemClassName="sm:col-span-2"
          />
        </div>

        <ul className="divide-y rounded-md border text-sm">
          {data.checks.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                Nº {c.number} · {c.bank}{' '}
                <span className="text-xs text-muted-foreground">· pago {formatDay(c.paymentDate)}</span>
              </span>
              <span className="tabular-nums">{formatInCurrency(c.amount, 'ARS')}</span>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm tabular-nums">
          <dt>Nominal</dt>
          <dd className="text-right">{pesos(nominal)}</dd>
          <dt>Intereses y comisión</dt>
          <dd className="text-right">-{pesos((interestCents ?? BigInt(0)) + (feeCents ?? BigInt(0)))}</dd>
          <dt className="font-semibold">Neto al banco</dt>
          <dd className="text-right font-semibold">{pesos(net)}</dd>
        </dl>
        {netProblem && (
          <p role="alert" className="text-sm text-destructive">
            {netProblem}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending || netProblem !== null}>
            {save.isPending ? 'Descontando…' : 'Descontar'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
