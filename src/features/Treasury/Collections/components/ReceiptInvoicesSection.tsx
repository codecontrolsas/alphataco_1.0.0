'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import moment from 'moment';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { OpenCustomerInvoice } from '../../lib/receivables';
import { formatInCurrency } from '../../lib/currency-format';
import { arsToApplied, RATE_SCALE } from '../../lib/receipt-math';
import type { ReceiptPreview } from '../../lib/receipt-preview';
import type { ReceiptFormValues } from '../../schemas/receipts';

const dmy = (value: string | null) => (value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : null);

/**
 * Comprobantes pendientes del cliente: se tildan con el pendiente completo ("Total") y se
 * ajustan si el cobro es parcial. En moneda extranjera el importe también se puede cargar en pesos
 * (se convierte con la cotización del cobro).
 */
export function ReceiptInvoicesSection({
  form,
  values,
  invoices,
  preview,
  loading,
}: {
  form: UseFormReturn<ReceiptFormValues>;
  values: ReceiptFormValues;
  invoices: OpenCustomerInvoice[];
  preview: ReceiptPreview;
  loading: boolean;
}) {
  /** Lo que se está tipeando en pesos, por comprobante (mientras el campo tiene foco). */
  const [pesosDraft, setPesosDraft] = useState<Record<string, string>>({});
  const indexOf = (invoiceId: string) => values.invoices.findIndex((l) => l.invoiceId === invoiceId);
  const rateOf = (currency: string) => values.rates.find((r) => r.currency === currency)?.rate ?? '';

  const toggle = (invoice: OpenCustomerInvoice, checked: boolean) => {
    const lines = values.invoices.filter((l) => l.invoiceId !== invoice.invoiceId);
    if (checked) lines.push({ invoiceId: invoice.invoiceId, amount: invoice.pending });
    form.setValue('invoices', lines, { shouldValidate: form.formState.isSubmitted });
    // Una cotización por cada moneda extranjera presente; se quita cuando no queda ninguna.
    const currencies = new Set(
      lines.map((l) => invoices.find((i) => i.invoiceId === l.invoiceId)?.currency).filter((c): c is string => Boolean(c) && c !== 'ARS')
    );
    const rates = values.rates.filter((r) => currencies.has(r.currency));
    for (const currency of currencies) {
      if (!rates.some((r) => r.currency === currency)) rates.push({ currency: currency as 'USD' | 'EUR', rate: '' });
    }
    form.setValue('rates', rates);
  };

  const setAmount = (invoiceId: string, amount: string) => {
    const index = indexOf(invoiceId);
    if (index >= 0) form.setValue(`invoices.${index}.amount`, amount, { shouldValidate: form.formState.isSubmitted });
  };

  const setPesos = (invoice: OpenCustomerInvoice, pesos: string) => {
    setPesosDraft((d) => ({ ...d, [invoice.invoiceId]: pesos }));
    const ars = parseScaled(pesos, AMOUNT_SCALE);
    const rate = parseScaled(rateOf(invoice.currency), RATE_SCALE);
    if (ars !== null && rate !== null && rate > BigInt(0)) setAmount(invoice.invoiceId, formatScaled(arsToApplied(ars, rate), AMOUNT_SCALE));
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando los comprobantes del cliente…</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Comprobantes pendientes</p>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">El cliente no tiene comprobantes pendientes. Podés registrar un cobro a cuenta.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {invoices.map((invoice) => {
            const index = indexOf(invoice.invoiceId);
            const selected = index >= 0;
            const foreign = invoice.currency !== 'ARS';
            const computed = preview.lines[invoice.invoiceId];
            const id = `receipt-invoice-${invoice.invoiceId}`;
            const due = dmy(invoice.dueDate);
            const overdue = invoice.dueDate !== null && invoice.dueDate < moment().format('YYYY-MM-DD');
            return (
              <li key={invoice.invoiceId} className="space-y-2 px-3 py-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Checkbox id={id} className="mt-0.5" checked={selected} onCheckedChange={(c) => toggle(invoice, c === true)} />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      {invoice.label}
                      {foreign && <Badge variant="outline">{invoice.currency}</Badge>}
                      {overdue && <Badge variant="destructive">Vencido</Badge>}
                      {!invoice.pending.startsWith('-') && invoice.pending !== '0.00' ? null : (
                        <Badge variant="outline">Sin pendiente: destildala</Badge>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {due ? `Vence ${due}` : 'Sin vencimiento'} · total {formatInCurrency(invoice.total, invoice.currency)} · pendiente{' '}
                      {formatInCurrency(invoice.pending, invoice.currency)}
                      {invoice.reserved !== '0.00' && ` · ${formatInCurrency(invoice.reserved, invoice.currency)} en otro borrador`}
                    </span>
                  </label>
                  </div>
                  <div className="flex items-center gap-1 pl-7 sm:pl-0">
                    <Input
                      aria-label={`Importe de ${invoice.label} en ${invoice.currency}`}
                      inputMode="decimal"
                      className="w-36 text-right tabular-nums"
                      disabled={!selected}
                      value={selected ? (values.invoices[index]?.amount ?? '') : ''}
                      placeholder={invoice.pending}
                      onChange={(e) => setAmount(invoice.invoiceId, e.target.value)}
                    />
                    <Button type="button" variant="ghost" size="sm" disabled={!selected} onClick={() => setAmount(invoice.invoiceId, invoice.pending)}>
                      Total
                    </Button>
                  </div>
                </div>
                {selected && foreign && (
                  <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted-foreground">
                    <span>En pesos</span>
                    <Input
                      aria-label={`Importe de ${invoice.label} en pesos`}
                      inputMode="decimal"
                      className="h-8 w-40 text-right tabular-nums"
                      disabled={!rateOf(invoice.currency)}
                      value={pesosDraft[invoice.invoiceId] ?? computed?.ars ?? ''}
                      placeholder={rateOf(invoice.currency) ? '' : 'Cargá la cotización'}
                      onChange={(e) => setPesos(invoice, e.target.value)}
                      onBlur={() => setPesosDraft(({ [invoice.invoiceId]: _gone, ...rest }) => rest)}
                    />
                    {computed && computed.fx !== '0.00' && (
                      <span className={computed.fx.startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                        Diferencia de cambio {formatInCurrency(computed.fx, 'ARS')}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {form.formState.errors.invoices?.message && <p className="text-sm text-destructive">{form.formState.errors.invoices.message}</p>}
    </div>
  );
}
