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
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { getCheckbooksForPayment } from '@/features/Treasury/actions/own-checks.server';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { getPortfolioChecksForPayment } from '../../actions/payment-queries.server';
import { registerPayment } from '../../actions/payment-register.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { cents, money } from '../../lib/payment-totals';
import {
  PAYMENT_METHOD_LABELS,
  SUPPLIER_PAYMENT_METHODS,
  registerPaymentFormSchema,
  type RegisterPaymentFormValues,
} from '../../schemas/payment-orders';

type Payment = RegisterPaymentFormValues['payments'][number];

const dmy = (value: string) => formatDateAr(value);

const logger = new Logger('Purchases/RegisterPaymentDialog');

const emptyPayment = (amount: string, accountId: string): Payment => ({
  method: 'TRANSFER',
  accountId,
  amount,
  reference: '',
  checkNumber: '',
  checkBank: '',
  checkDueOn: '',
  thirdPartyCheckId: '',
  checkbookId: '',
});

/**
 * Registrar el pago de una orden aprobada: fecha real y uno o varios medios desde cuentas o cajas,
 * cheques de terceros de la cartera que se endosan al proveedor (Tesoreria etapa 3a) o cheques
 * propios: el fisico sale de una chequera con el proximo numero libre y el e-cheq de una cuenta
 * bancaria; los dos quedan emitidos hasta que se confirma el debito (etapa 3b). El total de los
 * medios se controla en vivo contra el neto a pagar.
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
  // Una cartera de cheques no paga con transferencia ni efectivo: sus cheques se endosan.
  const active = accounts.filter((a) => a.is_active && a.kind !== 'CHECK_PORTFOLIO');
  // Un cheque propio (fisico o e-cheq) sale de una cuenta bancaria.
  const banks = active.filter((a) => a.kind === 'BANK');
  const defaultAccount = active.length === 1 ? active[0]!.id : '';
  // Neto 0: lo pagado queda compensado con NC o anticipos y se registra sin medios de pago.
  const isZero = cents(netTotal) === BigInt(0);

  const form = useForm<RegisterPaymentFormValues>({
    resolver: zodResolver(registerPaymentFormSchema),
    defaultValues: { paidOn: plannedOn, payments: isZero ? [] : [emptyPayment(netTotal, defaultAccount)] },
  });
  const payments = useFieldArray({ control: form.control, name: 'payments' });
  const watched = useWatch({ control: form.control, name: 'payments' });
  const {
    data: portfolioChecks,
    isLoading: loadingChecks,
    isError: checksError,
  } = useQuery({
    queryKey: ['purchases-portfolio-checks', orderId],
    queryFn: () => getPortfolioChecksForPayment(),
    enabled: open,
    staleTime: 0,
  });
  const {
    data: checkbooks,
    isLoading: loadingCheckbooks,
    isError: checkbooksError,
  } = useQuery({
    queryKey: ['purchases-checkbooks', orderId],
    queryFn: () => getCheckbooksForPayment(),
    enabled: open,
    staleTime: 0,
  });
  const checkOf = (id: string | undefined) => portfolioChecks?.find((c) => c.id === id);

  /** Próximo número libre de la chequera que no esté ya en otro medio de este mismo pago. */
  const proposedNumber = (i: number, checkbookId: string) => {
    const checkbook = checkbooks?.find((c) => c.id === checkbookId);
    const taken = new Set(
      (form.getValues('payments') ?? [])
        .filter((p, j) => j !== i && p.method === 'CHECK' && p.checkbookId === checkbookId)
        .map((p) => p.checkNumber)
    );
    return checkbook?.freeNumbers.find((n) => !taken.has(n)) ?? '';
  };

  const chooseCheckbook = (i: number, checkbookId: string) => {
    form.setValue(`payments.${i}.checkbookId`, checkbookId);
    form.setValue(`payments.${i}.accountId`, checkbooks?.find((c) => c.id === checkbookId)?.account.id ?? '');
    form.setValue(`payments.${i}.checkNumber`, proposedNumber(i, checkbookId));
  };
  const amountOf = (p: Payment) =>
    p.method === 'THIRD_PARTY_CHECK' ? cents(checkOf(p.thirdPartyCheckId)?.amount ?? '0') : cents(p.amount);
  const sum = (watched ?? []).reduce((acc, p) => acc + amountOf(p), BigInt(0));
  const diff = cents(netTotal) - sum;

  /** Al pasar a cheque de tercero la cuenta y el importe salen del cheque; al volver, la cuenta por defecto. */
  const changeMethod = (i: number, method: Payment['method']) => {
    // Copia ANTES de cambiar: getValues devuelve el objeto que RHF modifica en el lugar.
    const previous = form.getValues(`payments.${i}.method`);
    form.setValue(`payments.${i}.method`, method);
    if (method === 'THIRD_PARTY_CHECK') {
      form.setValue(`payments.${i}.accountId`, '');
      form.setValue(`payments.${i}.amount`, '');
    } else if (previous === 'THIRD_PARTY_CHECK') {
      form.setValue(`payments.${i}.accountId`, defaultAccount);
      form.setValue(`payments.${i}.thirdPartyCheckId`, '');
    }
    if (previous === 'CHECK' && method !== 'CHECK') {
      form.setValue(`payments.${i}.checkbookId`, '');
      form.setValue(`payments.${i}.checkNumber`, '');
      if (method !== 'THIRD_PARTY_CHECK') form.setValue(`payments.${i}.accountId`, defaultAccount);
    }
    if (method === 'CHECK') {
      // Con una sola chequera, queda elegida con su próximo número.
      if (checkbooks?.length === 1) chooseCheckbook(i, checkbooks[0]!.id);
      else {
        form.setValue(`payments.${i}.checkbookId`, '');
        form.setValue(`payments.${i}.accountId`, '');
        form.setValue(`payments.${i}.checkNumber`, '');
      }
    }
    if (method === 'ECHECK' && !banks.some((b) => b.id === form.getValues(`payments.${i}.accountId`))) {
      form.setValue(`payments.${i}.accountId`, banks.length === 1 ? banks[0]!.id : '');
    }
  };

  const save = useMutation({
    mutationFn: async (values: RegisterPaymentFormValues) => unwrapAction(await registerPayment(orderId, values)),
    onSuccess: (result) => {
      const n = result.certificates.length;
      toast.success(`${result.number} pagada`, {
        description:
          n > 0
            ? `${n} ${n === 1 ? 'certificado de retención' : 'certificados de retención'}: ${result.certificates.join(', ')}`
            : undefined,
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
          <p className="text-sm text-muted-foreground">
            No hay cuentas ni cajas activas: cargalas en Configuración de Compras.
          </p>
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
                const isThirdParty = method === 'THIRD_PARTY_CHECK';
                const taken = new Set(
                  (watched ?? [])
                    .filter((_, j) => j !== i)
                    .map((p) => p.thirdPartyCheckId)
                    .filter(Boolean)
                );
                return (
                  <div key={f.id} className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-3 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
                      <FormField
                        control={form.control}
                        name={`payments.${i}.method`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Medio</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => changeMethod(i, value as Payment['method'])}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SUPPLIER_PAYMENT_METHODS.map((m) => (
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
                      {isThirdParty ? (
                        <FormField
                          control={form.control}
                          name={`payments.${i}.thirdPartyCheckId`}
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Cheque de la cartera</FormLabel>
                              <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={loadingChecks}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder={loadingChecks ? 'Cargando cheques…' : 'Elegí el cheque'}
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {checksError && (
                                    <p className="px-2 py-1.5 text-sm text-danger-subtle-foreground">
                                      No se pudo cargar la cartera
                                    </p>
                                  )}
                                  {!checksError && (portfolioChecks ?? []).length === 0 && (
                                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                      No hay cheques en cartera
                                    </p>
                                  )}
                                  {(portfolioChecks ?? [])
                                    .filter((c) => !taken.has(c.id))
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        Nº {c.number} · {c.bank} · {c.drawerName} · pago {dmy(c.paymentDate)} —{' '}
                                        {formatMoney(c.amount)}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : method === 'CHECK' ? (
                        <FormField
                          control={form.control}
                          name={`payments.${i}.checkbookId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chequera</FormLabel>
                              <Select
                                key={checkbooks?.length ?? 0}
                                value={field.value ?? ''}
                                onValueChange={(value) => chooseCheckbook(i, value)}
                                disabled={loadingCheckbooks}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder={loadingCheckbooks ? 'Cargando chequeras…' : 'Elegí la chequera'}
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {checkbooksError && (
                                    <p className="px-2 py-1.5 text-sm text-danger-subtle-foreground">
                                      No se pudieron cargar las chequeras
                                    </p>
                                  )}
                                  {!checkbooksError && (checkbooks ?? []).length === 0 && (
                                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                      No hay chequeras con números libres: cargala en Tesorería → Cheques propios
                                    </p>
                                  )}
                                  {(checkbooks ?? []).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.account.name} · Nº {c.firstNumber} al {c.lastNumber} · {c.free} libres
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name={`payments.${i}.accountId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{method === 'ECHECK' ? 'Cuenta bancaria' : 'Cuenta o caja'}</FormLabel>
                              <Select key={method} value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Desde dónde se paga" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {(method === 'ECHECK' ? banks : active).map((a) => (
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
                      )}
                      {!isThirdParty && (
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
                      )}
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
                    {isCheck && (
                      <p className="text-xs text-muted-foreground">
                        El cheque queda emitido: sale de la cuenta cuando confirmás su débito en Tesorería → Cheques
                        propios.
                      </p>
                    )}
                    {isThirdParty ? (
                      <p className="text-xs text-muted-foreground">
                        Se endosa al proveedor por su importe completo y sale de la cartera en la fecha de pago.
                      </p>
                    ) : (
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
                    )}
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
                    className={`text-sm tabular-nums ${diff === BigInt(0) ? 'text-ok-subtle-foreground' : 'text-warn-subtle-foreground'}`}
                  >
                    Medios {formatMoney(money(sum))} de {formatMoney(netTotal)}
                    {diff !== BigInt(0) &&
                      ` · ${diff > BigInt(0) ? 'faltan' : 'sobran'} ${formatMoney(money(diff > BigInt(0) ? diff : -diff))}`}
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
