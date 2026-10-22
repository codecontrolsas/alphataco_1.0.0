'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InputFormField } from '@/shared/components/common/form-fields';
import moment from 'moment';
import type { UseFormReturn } from 'react-hook-form';
import { formatInCurrency } from '../../lib/currency-format';
import type { CustomerAdvanceBalance } from '../../lib/receivables';
import type { ReceiptFormValues } from '../../schemas/receipts';

/**
 * Anticipos del cliente para aplicar (restan de lo que tiene que entregar, sin mover plata) y el
 * cobro a cuenta de este recibo (queda como saldo a favor del cliente).
 */
export function ReceiptAdvancesSection({
  form,
  values,
  advances,
}: {
  form: UseFormReturn<ReceiptFormValues>;
  values: ReceiptFormValues;
  advances: CustomerAdvanceBalance[];
}) {
  const indexOf = (lineId: string) => values.advancesApplied.findIndex((l) => l.sourceLineId === lineId);

  const toggle = (advance: CustomerAdvanceBalance, checked: boolean) => {
    const lines = values.advancesApplied.filter((l) => l.sourceLineId !== advance.lineId);
    if (checked) lines.push({ sourceLineId: advance.lineId, amount: advance.available });
    form.setValue('advancesApplied', lines, { shouldValidate: form.formState.isSubmitted });
  };

  return (
    <div className="space-y-4">
      {advances.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Anticipos para aplicar</p>
          <ul className="divide-y rounded-md border">
            {advances.map((advance) => {
              const index = indexOf(advance.lineId);
              const selected = index >= 0;
              const id = `receipt-advance-${advance.lineId}`;
              return (
                <li key={advance.lineId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={selected}
                      onCheckedChange={(c) => toggle(advance, c === true)}
                    />
                    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block">Cobrado a cuenta en {advance.receiptNumber}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {advance.description ?? 'Sin descripción'} ·{' '}
                        {moment(advance.date, 'YYYY-MM-DD').format('DD/MM/YYYY')} · disponible{' '}
                        {formatInCurrency(advance.available, 'ARS')}
                      </span>
                    </label>
                  </div>
                  <Input
                    aria-label={`Importe a aplicar de ${advance.receiptNumber}`}
                    inputMode="decimal"
                    className="ml-7 w-36 text-right tabular-nums sm:ml-0"
                    disabled={!selected}
                    value={selected ? values.advancesApplied[index]?.amount ?? '' : ''}
                    placeholder={advance.available}
                    onChange={(e) =>
                      index >= 0 &&
                      form.setValue(`advancesApplied.${index}.amount`, e.target.value, {
                        shouldValidate: form.formState.isSubmitted,
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Cobro a cuenta (opcional)</p>
        <p className="text-xs text-muted-foreground">
          Lo que el cliente paga de más o sin factura. Queda a su favor para aplicar en un recibo posterior.
        </p>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <InputFormField
            control={form.control}
            name="advance.amount"
            label="Importe"
            inputMode="decimal"
            placeholder="0,00"
            className="text-right tabular-nums"
          />
          <InputFormField
            control={form.control}
            name="advance.description"
            label="Descripción"
            placeholder="Anticipo de la obra de noviembre"
          />
        </div>
      </div>
    </div>
  );
}
