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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { TreasuryConceptRow } from '../../actions/concepts.server';
import { createManualMovement, updateManualMovement, type MovementDetail } from '../../actions/movements.server';
import { BalancePreview } from '../../components/BalancePreview';
import { NegativeCashConfirm } from '../../components/NegativeCashConfirm';
import { useBalanceAfter } from '../../hooks/useBalanceAfter';
import { invalidateTreasury } from '../../lib/invalidate';
import { conceptAllows, signedCents } from '../../lib/movement-rules';
import { treasuryToday } from '../../lib/today';
import {
  MOVEMENT_DIRECTION_LABELS,
  manualMovementFormSchema,
  type ManualMovementFormValues,
} from '../../schemas/movements';
import { isPositiveAmount } from '../../schemas/shared';

const logger = new Logger('Treasury/MovementFormDialog');

interface MovementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: TreasuryAccountRow[];
  concepts: TreasuryConceptRow[];
  /** Movimiento manual a editar; sin él, alta. */
  editing?: MovementDetail | null;
  /** Cuenta preelegida en el alta (desde el extracto). */
  defaultAccountId?: string;
}

const emptyValues = (accountId: string): ManualMovementFormValues => ({
  accountId,
  date: treasuryToday(),
  direction: 'OUT',
  amount: '',
  conceptId: '',
  description: '',
});

/**
 * Alta y edición de un movimiento manual (spec Tesorería etapa 1 §3): cuenta, fecha, ingreso o
 * egreso, importe, concepto (filtrado por el sentido) y descripción. Muestra cómo queda la cuenta
 * a esa fecha; si una caja queda en negativo, pide confirmar antes de guardar.
 *
 * Se monta al abrirse (`{open && <MovementFormDialog … />}`): así cada apertura arranca limpia.
 */
export function MovementFormDialog({
  open,
  onOpenChange,
  accounts,
  concepts,
  editing,
  defaultAccountId,
}: MovementFormDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmNegative, setConfirmNegative] = useState<ManualMovementFormValues | null>(null);

  const form = useForm<ManualMovementFormValues>({
    resolver: zodResolver(manualMovementFormSchema),
    defaultValues: editing
      ? {
          accountId: editing.accountId,
          date: editing.date,
          direction: editing.direction,
          amount: editing.absAmount,
          conceptId: editing.conceptId ?? '',
          description: editing.description,
        }
      : emptyValues(defaultAccountId ?? ''),
  });

  const [accountId, date, direction, amount] = useWatch({
    control: form.control,
    name: ['accountId', 'date', 'direction', 'amount'],
  });
  // Una cuenta inactiva solo aparece si es la del movimiento que se edita (puede conservarla).
  const accountOptions: Pick<TreasuryAccountRow, 'id' | 'name' | 'kind' | 'is_active'>[] = accounts.filter(
    (a) => a.is_active
  );
  if (editing && !accountOptions.some((a) => a.id === editing.accountId)) accountOptions.push(editing.account);
  const account = accountOptions.find((a) => a.id === accountId);
  const conceptOptions = concepts.filter(
    (c) => (c.is_active || c.id === editing?.conceptId) && conceptAllows(c.direction, direction)
  );

  const delta = isPositiveAmount(amount) ? signedCents(direction, amount) : null;
  const preview = useBalanceAfter(accountId, date, delta, editing?.id);

  const save = useMutation({
    mutationFn: async (values: ManualMovementFormValues) =>
      unwrapAction(editing ? await updateManualMovement(editing.id, values) : await createManualMovement(values)),
    onSuccess: () => {
      toast.success(editing ? 'Movimiento actualizado' : 'Movimiento registrado');
      setConfirmNegative(null);
      onOpenChange(false);
      invalidateTreasury(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el movimiento', { data: { error } });
      setConfirmNegative(null);
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el movimiento');
    },
  });

  const onSubmit = (values: ManualMovementFormValues) => {
    if (account?.kind === 'CASH' && preview.after?.startsWith('-')) {
      setConfirmNegative(values);
      return;
    }
    save.mutate(values);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</DialogTitle>
            <DialogDescription>
              Ingresos y egresos que no salen de otro documento: gastos bancarios, aportes, retiros…
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sentido</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        className="justify-start"
                        value={field.value}
                        onValueChange={(value) => {
                          if (value !== 'IN' && value !== 'OUT') return;
                          field.onChange(value);
                          // El concepto elegido puede no admitir el sentido nuevo.
                          const concept = concepts.find((c) => c.id === form.getValues('conceptId'));
                          if (concept && !conceptAllows(concept.direction, value)) form.setValue('conceptId', '');
                        }}
                      >
                        <ToggleGroupItem type="button" value="IN" className="px-4">
                          {MOVEMENT_DIRECTION_LABELS.IN}
                        </ToggleGroupItem>
                        <ToggleGroupItem type="button" value="OUT" className="px-4">
                          {MOVEMENT_DIRECTION_LABELS.OUT}
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cuenta o caja</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Elegí la cuenta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accountOptions.map((a) => (
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
                <FormField
                  control={form.control}
                  name="conceptId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Concepto</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                conceptOptions.length ? 'Elegí el concepto' : 'Sin conceptos para este sentido'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {conceptOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {account && <BalancePreview accountName={account.name} date={date} preview={preview} />}
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
        accountName={account?.name ?? ''}
        after={preview.after}
        open={confirmNegative !== null}
        pending={save.isPending}
        onCancel={() => setConfirmNegative(null)}
        onConfirm={() => confirmNegative && save.mutate(confirmNegative)}
      />
    </>
  );
}
