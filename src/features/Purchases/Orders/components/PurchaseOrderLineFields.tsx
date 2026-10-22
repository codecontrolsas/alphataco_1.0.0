'use client';

import { Button } from '@/components/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatMoney, formatQuantity } from '@/features/Warehouses/lib/format';
import { InputFormField } from '@/shared/components/common/form-fields';
import { VAT_RATES, VAT_RATE_LABELS } from '@/shared/lib/arca/catalogs';
import { Trash2 } from 'lucide-react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import type { OrderableRequestLineOption } from '../../lib/order-query-types';
import { computeOrderLine } from '../../lib/order-totals';
import { lineOptionLabel, searchLineOptions } from '../../lib/orderable-line-options';
import { trimDecimals } from '../../lib/quantity-format';
import { type PurchaseOrderFormValues } from '../../schemas/orders';

const VAT_RATE_IDS = Object.keys(VAT_RATES).map(Number) as (keyof typeof VAT_RATES)[];

interface OrderLineFieldsProps {
  form: UseFormReturn<PurchaseOrderFormValues>;
  index: number;
  option: OrderableRequestLineOption | null;
  canRemove: boolean;
  onRemove: () => void;
  onOption: (option: OrderableRequestLineOption) => void;
  /** Linea y cantidad fijas (OC complementaria). */
  locked: boolean;
}

export function OrderLineFields({ form, index, option, canRemove, onRemove, onOption, locked }: OrderLineFieldsProps) {
  const line = useWatch({ control: form.control, name: `lines.${index}` });
  const amounts = line ? computeOrderLine(line) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <FormField
          control={form.control}
          name={`lines.${index}.requestLineId`}
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <FormLabel>Línea de solicitud</FormLabel>
              <FormControl>
                <SearchCombobox
                  queryKey={['purchase-orderable-lines']}
                  search={searchLineOptions}
                  disabled={locked}
                  value={field.value}
                  selectedLabel={option ? lineOptionLabel(option) : null}
                  onSelect={(selected) => {
                    field.onChange(selected?.id ?? '');
                    // Una linea nueva no viene de una cotizacion; la cantidad propuesta es lo que falta.
                    form.setValue(`lines.${index}.quoteLineId`, '');
                    if (selected) {
                      onOption(selected);
                      form.setValue(`lines.${index}.quantity`, trimDecimals(selected.remaining));
                    }
                  }}
                  placeholder="Elegí la línea"
                  searchPlaceholder="Número de solicitud, material o descripción…"
                  noun="líneas"
                  renderOption={(o) => (
                    <span className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Falta {formatQuantity(o.remaining)} {o.unitAbbr}
                      </span>
                    </span>
                  )}
                />
              </FormControl>
              {option && (
                <FormDescription className="tabular-nums">
                  Pedido en la solicitud: {formatQuantity(option.requested)} {option.unitAbbr} · se puede pedir hasta{' '}
                  {formatQuantity(option.remaining)} {option.unitAbbr}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        {canRemove && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="mt-8 shrink-0"
            onClick={onRemove}
            aria-label={`Quitar la línea ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <FormField
          control={form.control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cantidad{option ? ` (${option.unitAbbr})` : ''}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" className="tabular-nums" placeholder="0" readOnly={locked} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <InputFormField
          control={form.control}
          name={`lines.${index}.unitPrice`}
          label="Precio unitario neto"
          inputMode="decimal"
          className="tabular-nums"
          placeholder="0,00"
        />
        <FormField
          control={form.control}
          name={`lines.${index}.vatRateId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>IVA</FormLabel>
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {VAT_RATE_IDS.map((id) => (
                    <SelectItem key={id} value={String(id)}>
                      {VAT_RATE_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Neto de la línea</p>
          <p className="py-2 text-sm tabular-nums">{amounts ? formatMoney(amounts.netTotal) : '—'}</p>
        </div>
      </div>
    </div>
  );
}
