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
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import { getCheckbooksForPayment } from '@/features/Treasury/actions/own-checks.server';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { DateFormField } from '@/shared/components/common/form-fields';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { getPortfolioChecksForPayment } from '../../actions/payment-queries.server';
import { registerPayment } from '../../actions/payment-register.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { cents, money } from '../../lib/payment-totals';
import { registerPaymentFormSchema, type RegisterPaymentFormValues } from '../../schemas/payment-orders';

import { RegisterPaymentRow, type PaymentSources } from './RegisterPaymentRow';

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
  const sources: PaymentSources = {
    accounts: active,
    banks,
    portfolioChecks,
    loadingChecks,
    checksError,
    checkbooks,
    loadingCheckbooks,
    checkbooksError,
  };
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
              <DateFormField control={form.control} name="paidOn" label="Fecha de pago" itemClassName="max-w-xs" />
              {payments.fields.map((f, i) => (
                <RegisterPaymentRow
                  key={f.id}
                  form={form}
                  index={i}
                  method={watched?.[i]?.method}
                  takenCheckIds={
                    new Set(
                      (watched ?? [])
                        .filter((_, j) => j !== i)
                        .map((p) => p.thirdPartyCheckId)
                        .filter(Boolean)
                    )
                  }
                  sources={sources}
                  canRemove={payments.fields.length > 1}
                  onChangeMethod={(method) => changeMethod(i, method)}
                  onChooseCheckbook={(checkbookId) => chooseCheckbook(i, checkbookId)}
                  onRemove={() => payments.remove(i)}
                />
              ))}
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
