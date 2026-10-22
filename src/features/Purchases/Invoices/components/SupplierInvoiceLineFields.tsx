'use client';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney, formatQuantity, formatUnitCost } from '@/features/Warehouses/lib/format';
import { InputFormField } from '@/shared/components/common/form-fields';
import { VAT_RATE_LABELS, type VoucherLetter } from '@/shared/lib/arca/catalogs';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { expectedOrderPrice, pendingToInvoice } from '../../lib/invoice-form';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { comparePrices } from '../../lib/order-totals';
import { RATE_OPTIONS, type FormValues, type OrderLineOption } from './supplier-invoice-form-model';

export function InvoiceLineFields({
  form,
  index,
  letter,
  orderLine,
  categories,
  amount,
  onRemove,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  letter: VoucherLetter | null;
  orderLine: OrderLineOption | null;
  categories: SupplierInvoiceFormData['categories'];
  amount: { netTotal: string; vatAmount: string } | null;
  onRemove: () => void;
}) {
  const line = useWatch({ control: form.control, name: `lines.${index}` });
  const isOrder = line?.kind === 'order';

  const expectedPrice = orderLine && letter ? expectedOrderPrice(orderLine, letter) : null;
  const priceDiffers =
    isOrder &&
    expectedPrice !== null &&
    line.unitPrice !== '' &&
    comparePrices(line.unitPrice.replace(',', '.'), expectedPrice) !== 0;
  const rateDiffers =
    isOrder && orderLine && letter !== 'C' && line.vatRateId !== '' && Number(line.vatRateId) !== orderLine.vatRateId;
  const pending = orderLine ? pendingToInvoice(orderLine) : '0';

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          {isOrder ? (
            orderLine ? (
              <>
                <p className="font-medium">
                  <span className="font-mono">{orderLine.orderNumber}</span> · {orderLine.label}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Recibido {formatQuantity(orderLine.received)} {orderLine.unitAbbr} · facturado{' '}
                  {formatQuantity(orderLine.invoiced)} · por facturar {formatQuantity(pending)} {orderLine.unitAbbr}
                </p>
              </>
            ) : (
              <p className="font-medium text-muted-foreground">Línea de OC</p>
            )
          ) : (
            <p className="font-medium">Gasto sin OC</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Quitar la línea"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isOrder ? (
          <>
            <InputFormField
              control={form.control}
              name={`lines.${index}.quantity`}
              label="Cantidad"
              inputMode="decimal"
            />
            <FormField
              control={form.control}
              name={`lines.${index}.unitPrice`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{letter === 'C' ? 'Precio unitario final' : 'Precio unitario neto'}</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <>
            <FormField
              control={form.control}
              name={`lines.${index}.expenseCategoryId`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Concepto</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            categories.length ? 'Elegí el concepto' : 'Sin conceptos: crealos en Configuración'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <InputFormField
              control={form.control}
              name={`lines.${index}.description`}
              label="Descripción"
              placeholder="Luz de octubre, base Neuquén"
            />
            <FormField
              control={form.control}
              name={`lines.${index}.net`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{letter === 'C' ? 'Importe' : 'Neto'}</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        {letter !== 'C' && (
          <FormField
            control={form.control}
            name={`lines.${index}.vatRateId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Alícuota</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="IVA" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RATE_OPTIONS.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="space-y-1">
          {priceDiffers && expectedPrice && (
            <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              En la {orderLine?.orderNumber} el precio es {formatUnitCost(expectedPrice)}: va a quedar observada.
            </p>
          )}
          {rateDiffers && orderLine && (
            <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              En la {orderLine.orderNumber} la alícuota es{' '}
              {VAT_RATE_LABELS[orderLine.vatRateId as keyof typeof VAT_RATE_LABELS]}: va a quedar observada.
            </p>
          )}
        </div>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {amount ? `${letter === 'C' ? 'Importe' : 'Neto'} ${formatMoney(amount.netTotal)}` : '—'}
        </span>
      </div>
    </div>
  );
}
