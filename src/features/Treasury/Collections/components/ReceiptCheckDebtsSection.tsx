'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import moment from 'moment';
import type { UseFormReturn } from 'react-hook-form';
import type { ReceiptFormData } from '../../lib/receipt-types';
import { formatInCurrency } from '../../lib/currency-format';
import type { ReceiptFormValues } from '../../schemas/receipts';

type CheckDebt = ReceiptFormData['checkDebts'][number];

/**
 * Deudas del cliente por cheques rechazados (spec Tesorería etapa 3a §2.7): se tildan con lo que
 * queda ("Total") y se ajustan si el cobro es parcial, igual que un comprobante.
 */
export function ReceiptCheckDebtsSection({ form, values, debts }: { form: UseFormReturn<ReceiptFormValues>; values: ReceiptFormValues; debts: CheckDebt[] }) {
  const lines = values.rejectedChecks ?? [];
  if (debts.length === 0) return null;
  const indexOf = (checkId: string) => lines.findIndex((l) => l.checkId === checkId);

  const toggle = (debt: CheckDebt, checked: boolean) => {
    const next = lines.filter((l) => l.checkId !== debt.checkId);
    if (checked) next.push({ checkId: debt.checkId, amount: debt.pending });
    form.setValue('rejectedChecks', next, { shouldValidate: form.formState.isSubmitted });
  };
  const setAmount = (checkId: string, amount: string) => {
    const index = indexOf(checkId);
    if (index >= 0) form.setValue(`rejectedChecks.${index}.amount`, amount, { shouldValidate: form.formState.isSubmitted });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Cheques rechazados</p>
      <ul className="divide-y rounded-md border">
        {debts.map((debt) => {
          const index = indexOf(debt.checkId);
          const selected = index >= 0;
          const id = `receipt-check-debt-${debt.checkId}`;
          return (
            <li key={debt.checkId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Checkbox id={id} className="mt-0.5" checked={selected} onCheckedChange={(c) => toggle(debt, c === true)} />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="block">{debt.label}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    Rechazado el {moment(debt.rejectedOn, 'YYYY-MM-DD').format('DD/MM/YYYY')} · debe {formatInCurrency(debt.pending, 'ARS')}
                    {debt.reserved !== '0.00' && ` · ${formatInCurrency(debt.reserved, 'ARS')} en otro borrador`}
                  </span>
                </label>
              </div>
              <div className="flex items-center gap-1 pl-7 sm:pl-0">
                <Input
                  aria-label={`Importe de ${debt.label}`}
                  inputMode="decimal"
                  className="w-36 text-right tabular-nums"
                  disabled={!selected}
                  value={selected ? (lines[index]?.amount ?? '') : ''}
                  placeholder={debt.pending}
                  onChange={(e) => setAmount(debt.checkId, e.target.value)}
                />
                <Button type="button" variant="ghost" size="sm" disabled={!selected} onClick={() => setAmount(debt.checkId, debt.pending)}>
                  Total
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {form.formState.errors.rejectedChecks?.message && <p className="text-sm text-destructive">{form.formState.errors.rejectedChecks.message}</p>}
    </div>
  );
}
