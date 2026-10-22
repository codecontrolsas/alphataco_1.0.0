'use client';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TreasuryAccountRow } from '@/features/Treasury/actions/accounts.server';
import type { getCheckbooksForPayment } from '@/features/Treasury/actions/own-checks.server';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { DateFormField, InputFormField } from '@/shared/components/common/form-fields';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { Trash2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { getPortfolioChecksForPayment } from '../../actions/payment-queries.server';
import {
  PAYMENT_METHOD_LABELS,
  SUPPLIER_PAYMENT_METHODS,
  type RegisterPaymentFormValues,
} from '../../schemas/payment-orders';

type Payment = RegisterPaymentFormValues['payments'][number];

const dmy = (value: string) => formatDateAr(value);

type PortfolioChecks = Awaited<ReturnType<typeof getPortfolioChecksForPayment>>;
type Checkbooks = Awaited<ReturnType<typeof getCheckbooksForPayment>>;

/** Qué se pudo cargar para elegir cheques y chequeras (la carga es perezosa, al abrir el diálogo). */
export interface PaymentSources {
  accounts: TreasuryAccountRow[];
  banks: TreasuryAccountRow[];
  portfolioChecks: PortfolioChecks | undefined;
  loadingChecks: boolean;
  checksError: boolean;
  checkbooks: Checkbooks | undefined;
  loadingCheckbooks: boolean;
  checkbooksError: boolean;
}

interface RegisterPaymentRowProps {
  form: UseFormReturn<RegisterPaymentFormValues>;
  index: number;
  /** Medio de pago actual de la fila (observado en vivo). */
  method: Payment['method'] | undefined;
  /** Cheques de cartera ya elegidos en otras filas. */
  takenCheckIds: Set<string | undefined>;
  sources: PaymentSources;
  canRemove: boolean;
  onChangeMethod: (method: Payment['method']) => void;
  onChooseCheckbook: (checkbookId: string) => void;
  onRemove: () => void;
}

/** Un medio de pago del registro de pago: medio, cuenta/chequera/cheque, importe y datos del cheque. */
export function RegisterPaymentRow({
  form,
  index: i,
  method,
  takenCheckIds: taken,
  sources,
  canRemove,
  onChangeMethod,
  onChooseCheckbook,
  onRemove,
}: RegisterPaymentRowProps) {
  const {
    accounts: active,
    banks,
    portfolioChecks,
    loadingChecks,
    checksError,
    checkbooks,
    loadingCheckbooks,
    checkbooksError,
  } = sources;
  const isCheck = method === 'CHECK' || method === 'ECHECK';
  const isThirdParty = method === 'THIRD_PARTY_CHECK';
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
        <FormField
          control={form.control}
          name={`payments.${i}.method`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Medio</FormLabel>
              <Select value={field.value} onValueChange={(value) => onChangeMethod(value as Payment['method'])}>
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
                      <SelectValue placeholder={loadingChecks ? 'Cargando cheques…' : 'Elegí el cheque'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {checksError && (
                      <p className="px-2 py-1.5 text-sm text-danger-subtle-foreground">No se pudo cargar la cartera</p>
                    )}
                    {!checksError && (portfolioChecks ?? []).length === 0 && (
                      <p className="px-2 py-1.5 text-sm text-muted-foreground">No hay cheques en cartera</p>
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
                  onValueChange={(value) => onChooseCheckbook(value)}
                  disabled={loadingCheckbooks}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingCheckbooks ? 'Cargando chequeras…' : 'Elegí la chequera'} />
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
          <InputFormField
            control={form.control}
            name={`payments.${i}.amount`}
            label="Importe"
            inputMode="decimal"
            className="text-right tabular-nums"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Quitar el medio"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {isCheck && (
        <p className="text-xs text-muted-foreground">
          El cheque queda emitido: sale de la cuenta cuando confirmás su débito en Tesorería → Cheques propios.
        </p>
      )}
      {isThirdParty ? (
        <p className="text-xs text-muted-foreground">
          Se endosa al proveedor por su importe completo y sale de la cartera en la fecha de pago.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <InputFormField
            control={form.control}
            name={`payments.${i}.reference`}
            label="Referencia (opcional)"
            placeholder="N° de transferencia"
          />
          {isCheck && (
            <>
              <InputFormField control={form.control} name={`payments.${i}.checkNumber`} label="N° de cheque" />
              <DateFormField
                control={form.control}
                name={`payments.${i}.checkDueOn`}
                label="Fecha de pago del cheque"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
