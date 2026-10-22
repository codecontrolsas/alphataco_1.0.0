'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/features/Warehouses/lib/format';
import type { PaymentOrderFormValues } from '../../schemas/payment-orders';

export type PaymentLine = PaymentOrderFormValues['lines'][number];

/** Grupo de ítems pendientes (comprobantes, notas de crédito, anticipos, cheques) que se tildan para pagar. */
export function PaymentItemGroup({
  title,
  empty,
  items,
  kind,
  lines,
  lineOf,
  onToggle,
  onAmount,
}: {
  title: string;
  empty: string;
  items: { key: string; title: string; subtitle: string; max: string; maxLabel: string }[];
  kind: PaymentLine['kind'];
  lines: PaymentLine[];
  lineOf: (key: string, kind: PaymentLine['kind']) => number;
  onToggle: (key: string, kind: PaymentLine['kind'], amount: string, checked: boolean) => void;
  onAmount: (key: string, kind: PaymentLine['kind'], amount: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((item) => {
            const index = lineOf(item.key, kind);
            const selected = index >= 0;
            const id = `pay-${kind}-${item.key}`;
            return (
              <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={selected}
                  onCheckedChange={(c) => onToggle(item.key, kind, item.max, c === true)}
                />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="block">{item.title}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {item.subtitle} · {item.maxLabel} {formatMoney(item.max)}
                  </span>
                </label>
                <Input
                  aria-label={`Importe de ${item.title}`}
                  inputMode="decimal"
                  className="w-36 text-right tabular-nums"
                  disabled={!selected}
                  value={selected ? lines[index]?.amount ?? '' : ''}
                  placeholder={formatMoney(item.max)}
                  onChange={(e) => onAmount(item.key, kind, e.target.value)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
