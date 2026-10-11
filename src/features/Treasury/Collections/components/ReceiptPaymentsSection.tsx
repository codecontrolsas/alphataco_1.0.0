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
  checkIssueDate: '',
  drawerName: '',
  drawerCuit: '',
});

const isCheckMethod = (method: string | undefined) => method === 'CHECK' || method === 'ECHECK';
const toDate = (value: string | undefined) => (value ? moment(value, 'YYYY-MM-DD').toDate() : undefined);
const fromDate = (value: Date | undefined) => (value ? moment(value).format('YYYY-MM-DD') : '');

/**
 * Medios con los que pagó el cliente. La plata (transferencia, efectivo) entra a una cuenta o caja,
 * con su saldo a la vista; los cheques y e-cheqs entran a una cartera de cheques (etapa 3a) con su
 * librador, precargado con el cliente y editable.
 */
export function ReceiptPaymentsSection({
  form,
  accounts,
  gap,
  drawer,
}: {
  form: UseFormReturn<ReceiptFormValues>;
  accounts: TreasuryAccountRow[];
  gap: string;
  /** Cliente del recibo: librador por defecto de los cheques. */
  drawer: { name: string; cuit: string } | null;
}) {
  const payments = useFieldArray({ control: form.control, name: 'payments' });
  const watched = useWatch({ control: form.control, name: 'payments' });
  const moneyAccounts = accounts.filter((a) => a.kind !== 'CHECK_PORTFOLIO');
  const portfolios = accounts.filter((a) => a.kind === 'CHECK_PORTFOLIO');
  const defaultAccount = moneyAccounts.length === 1 ? (moneyAccounts[0]?.id ?? '') : '';
  const defaultPortfolio = portfolios.length === 1 ? (portfolios[0]?.id ?? '') : '';
  const missing = gap.startsWith('-') || gap === '0.00' ? '' : gap;

  /** Al pasar a cheque (o salir de cheque) la cuenta cambia de lista; el librador se precarga con el cliente. */
  const changeMethod = (i: number, method: Payment['method']) => {
    // Copia de los valores ANTES de cambiar: getValues devuelve el objeto que RHF modifica en el lugar.
    const { method: previous, drawerName, drawerCuit } = { ...form.getValues(`payments.${i}`) };
    form.setValue(`payments.${i}.method`, method);
    const wasCheck = isCheckMethod(previous);
    const nowCheck = isCheckMethod(method);
    if (wasCheck !== nowCheck) form.setValue(`payments.${i}.accountId`, nowCheck ? defaultPortfolio : defaultAccount);
    if (nowCheck && drawer) {
      if (!drawerName) form.setValue(`payments.${i}.drawerName`, drawer.name);
      if (!drawerCuit) form.setValue(`payments.${i}.drawerCuit`, drawer.cuit);
    }
  };

  return (
    <div className="space-y-3">
      {payments.fields.length === 0 && <p className="text-sm text-muted-foreground">Sin medios: un recibo que solo aplica anticipos no mueve plata.</p>}
      {payments.fields.map((f, i) => {
        const method = watched?.[i]?.method;
        const isCheck = isCheckMethod(method);
        const options = isCheck ? portfolios : moneyAccounts;
        return (
          <div key={f.id} className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
              <FormField
                control={form.control}
                name={`payments.${i}.method`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medio</FormLabel>
                    <Select value={field.value} onValueChange={(value) => changeMethod(i, value as Payment['method'])}>
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
                    <FormLabel>{isCheck ? 'Cartera de cheques' : 'Cuenta o caja'}</FormLabel>
                    {/* Remonta al cambiar de lista: Radix no refresca la etiqueta si cambian a la vez las opciones y el valor. */}
                    <Select key={isCheck ? 'portfolios' : 'accounts'} value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isCheck ? 'A qué cartera entra' : 'A dónde entra'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {options.length === 0 && (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            {isCheck ? 'No hay carteras: creá una en Tesorería → Configuración' : 'No hay cuentas activas'}
                          </p>
                        )}
                        {options.map((a) => (
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
                    name={`payments.${i}.checkIssueDate`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emisión</FormLabel>
                        <FormControl>
                          <EnhancedDatePicker date={toDate(field.value)} setDate={(d) => field.onChange(fromDate(d))} placeholder="DD/MM/AAAA" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>
            {isCheck && (
              <div className="grid gap-3 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name={`payments.${i}.checkDueOn`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de pago</FormLabel>
                      <FormControl>
                        <EnhancedDatePicker date={toDate(field.value)} setDate={(d) => field.onChange(fromDate(d))} placeholder="DD/MM/AAAA" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`payments.${i}.drawerName`}
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Librador</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`payments.${i}.drawerCuit`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CUIT del librador</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
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
