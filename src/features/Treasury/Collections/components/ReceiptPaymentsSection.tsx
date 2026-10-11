'use client';

import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/features/Purchases/schemas/payment-orders';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import type { TreasuryAccountRow } from '../../actions/accounts.server';
import type { ReceiptFormValues } from '../../schemas/receipts';

type Payment = ReceiptFormValues['payments'][number];

const emptyPayment = (amount: string, accountId: string): Payment => ({
  method: 'TRANSFER',
  accountId,
  amount,
  reference: '',
  checkNumber: '',
  checkBank: '',
  checkDueOn: '',
});

/**
 * Medios con los que pagó el cliente, cada uno a una cuenta o caja (con su saldo, como en el pago
 * de Compras). Los cheques y e-cheqs entran en su vencimiento: hasta ese día quedan "a acreditar".
 */
export function ReceiptPaymentsSection({ form, accounts, gap }: { form: UseFormReturn<ReceiptFormValues>; accounts: TreasuryAccountRow[]; gap: string }) {
  const payments = useFieldArray({ control: form.control, name: 'payments' });
  const watched = useWatch({ control: form.control, name: 'payments' });
  const defaultAccount = accounts.length === 1 ? (accounts[0]?.id ?? '') : '';
  const missing = gap.startsWith('-') || gap === '0.00' ? '' : gap;

  return (
    <div className="space-y-3">
      {payments.fields.length === 0 && <p className="text-sm text-muted-foreground">Sin medios: un recibo que solo aplica anticipos no mueve plata.</p>}
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
                    <FormLabel>{isCheck ? 'Cuenta donde se deposita' : 'Cuenta o caja'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="A dónde entra" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
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
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Quitar el medio" onClick={() => payments.remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <FormField
                control={form.control}
                name={`payments.${i}.reference`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="N° de operación" {...field} />
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
                    name={`payments.${i}.checkBank`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Banco</FormLabel>
                        <FormControl>
                          <Input placeholder="Banco emisor" {...field} />
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
                        <FormLabel>Vencimiento</FormLabel>
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
      <Button type="button" size="sm" variant="outline" onClick={() => payments.append(emptyPayment(missing, defaultAccount))}>
        <Plus className="mr-1 h-4 w-4" />
        Agregar medio
      </Button>
    </div>
  );
}
