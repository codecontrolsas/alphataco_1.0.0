'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { registerPayment } from '../../actions/payment-orders.server';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { cents, money } from '../../lib/payment-totals';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  registerPaymentFormSchema,
  type RegisterPaymentFormValues,
} from '../../schemas/payment-orders';

const logger = new Logger('Purchases/RegisterPaymentDialog');

const emptyPayment = (amount: string, accountId: string): RegisterPaymentFormValues['payments'][number] => ({
  method: 'TRANSFER',
  accountId,
  amount,
  reference: '',
  checkNumber: '',
  checkBank: '',
  checkDueOn: '',
});

/**
 * Registrar el pago de una orden aprobada: fecha real y uno o varios medios desde cuentas o cajas.
 * El total de los medios se controla en vivo contra el neto a pagar.
 */
export function RegisterPaymentDialog({
  orderId,
  number,
  netTotal,
  plannedOn,
  accounts,
}: {
  orderId: string;
  number: string;
  netTotal: string;
  plannedOn: string;
  accounts: TreasuryAccountRow[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const active = accounts.filter((a) => a.is_active);
  const defaultAccount = active.length === 1 ? active[0]!.id : '';
  // Neto 0: lo pagado queda compensado con NC o anticipos y se registra sin medios de pago.
  const isZero = cents(netTotal) === BigInt(0);

  const form = useForm<RegisterPaymentFormValues>({
    resolver: zodResolver(registerPaymentFormSchema),
    defaultValues: { paidOn: plannedOn, payments: isZero ? [] : [emptyPayment(netTotal, defaultAccount)] },
  });
  const payments = useFieldArray({ control: form.control, name: 'payments' });
  const watched = useWatch({ control: form.control, name: 'payments' });
  const sum = (watched ?? []).reduce((acc, p) => acc + cents(p.amount), BigInt(0));
  const diff = cents(netTotal) - sum;

  const save = useMutation({
    mutationFn: async (values: RegisterPaymentFormValues) => unwrapAction(await registerPayment(orderId, values)),
    onSuccess: (result) => {
      const n = result.certificates.length;
      toast.success(`${result.number} pagada`, {
        description: n > 0 ? `${n} ${n === 1 ? 'certificado de retención' : 'certificados de retención'}: ${result.certificates.join(', ')}` : undefined,
      });
      setOpen(false);
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al registrar el pago', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el pago');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Banknote className="mr-1 h-4 w-4" />
        Registrar pago
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar el pago de {number}</DialogTitle>
          <DialogDescription>
            {isZero
              ? 'El neto a pagar es $ 0: los comprobantes quedan compensados con las notas de crédito y los anticipos, sin medio de pago.'
              : `Neto a pagar ${formatMoney(netTotal)}. Cargá con qué se pagó; los medios tienen que sumar el neto.`}
          </DialogDescription>
        </DialogHeader>
        {active.length === 0 && !isZero ? (
          <p className="text-sm text-muted-foreground">No hay cuentas ni cajas activas: cargalas en Configuración de Compras.</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="paidOn"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Fecha de pago</FormLabel>
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
              {payments.fields.map((f, i) => {
                const method = watched?.[i]?.method;
                const isCheck = method === 'CHECK' || method === 'ECHECK';
                return (
                  <div key={f.id} className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-3 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
                      <FormField
                        control={form.control}
                        name={`payments.${i}.method`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Medio</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PAYMENT_METHODS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {PAYMENT_METHOD_LABELS[m]}
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
                        name={`payments.${i}.accountId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cuenta o caja</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Desde dónde se paga" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {active.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.name} — saldo {formatMoney(a.balance)}
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
                        name={`payments.${i}.amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Importe</FormLabel>
                            <FormControl>
                              <Input inputMode="decimal" className="text-right tabular-nums" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Quitar el medio"
                        disabled={payments.fields.length === 1}
                        onClick={() => payments.remove(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <FormField
                        control={form.control}
                        name={`payments.${i}.reference`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Referencia (opcional)</FormLabel>
                            <FormControl>
                              <Input placeholder="N° de transferencia" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {isCheck && (
                        <>
                          <FormField
                            control={form.control}
                            name={`payments.${i}.checkNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>N° de cheque</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`payments.${i}.checkDueOn`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Fecha de pago del cheque</FormLabel>
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
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {!isZero && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => payments.append(emptyPayment(diff > BigInt(0) ? money(diff) : '', defaultAccount))}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Otro medio
                </Button>
                <p
                  role="status"
                  className={`text-sm tabular-nums ${diff === BigInt(0) ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
                >
                  Medios {formatMoney(money(sum))} de {formatMoney(netTotal)}
                  {diff !== BigInt(0) && ` · ${diff > BigInt(0) ? 'faltan' : 'sobran'} ${formatMoney(money(diff > BigInt(0) ? diff : -diff))}`}
                </p>
              </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending || diff !== BigInt(0)}>
                  {save.isPending ? 'Registrando…' : 'Registrar pago'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
