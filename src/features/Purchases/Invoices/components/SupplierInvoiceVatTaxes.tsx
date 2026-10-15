'use client';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { VAT_RATE_LABELS } from '@/shared/lib/arca/catalogs';
import { Plus, Trash2 } from 'lucide-react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { SUPPLIER_INVOICE_TAX_KINDS, SUPPLIER_INVOICE_TAX_LABELS } from '../../schemas/invoices';
import { type FormValues } from './supplier-invoice-form-model';
import type { UseFieldArrayReturn } from 'react-hook-form';

export function SupplierInvoiceVatTaxes({
  form,
  taxes,
  vatShown,
  provinces,
  onVatAmountChange,
}: {
  form: UseFormReturn<FormValues>;
  taxes: UseFieldArrayReturn<FormValues, 'taxes'>;
  vatShown: { vatRateId: number; base: string; amount: string }[];
  provinces: SupplierInvoiceFormData['provinces'];
  onVatAmountChange: (vatRateId: number, amount: string) => void;
}) {
  return (
    <>
      {vatShown.length > 0 && (
        <div className="space-y-2">
          {vatShown.map((v) => (
            <div key={v.vatRateId} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[8rem_1fr_10rem]">
              <span className="text-sm font-medium">IVA {VAT_RATE_LABELS[v.vatRateId as keyof typeof VAT_RATE_LABELS]}</span>
              <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">sobre {formatMoney(v.base)}</span>
              <Input
                aria-label={`IVA ${VAT_RATE_LABELS[v.vatRateId as keyof typeof VAT_RATE_LABELS]}`}
                inputMode="decimal"
                className="text-right tabular-nums"
                value={v.amount}
                onChange={(e) => onVatAmountChange(v.vatRateId, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="untaxed"
          render={({ field }) => (
            <FormItem>
              <FormLabel>No gravado</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="0,00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="exempt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Exento</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="0,00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator />
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">Percepciones e impuestos</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => taxes.append({ kind: 'VAT_PERCEPTION', provinceId: '', description: '', amount: '' })}
        >
          <Plus className="mr-1 h-4 w-4" />
          Agregar
        </Button>
      </div>
      {taxes.fields.map((field, index) => (
        <TaxFields
          key={field.id}
          form={form}
          index={index}
          provinces={provinces}
          onRemove={() => taxes.remove(index)}
        />
      ))}
    </>
  );
}

function TaxFields({
  form,
  index,
  provinces,
  onRemove,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  provinces: SupplierInvoiceFormData['provinces'];
  onRemove: () => void;
}) {
  const kind = useWatch({ control: form.control, name: `taxes.${index}.kind` });
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[12rem_1fr_9rem_auto] sm:items-start">
      <FormField
        control={form.control}
        name={`taxes.${index}.kind`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sm:sr-only">Tipo</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SUPPLIER_INVOICE_TAX_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SUPPLIER_INVOICE_TAX_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {kind === 'GROSS_INCOME_PERCEPTION' ? (
        <FormField
          control={form.control}
          name={`taxes.${index}.provinceId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sm:sr-only">Provincia</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Provincia" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {provinces.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
          name={`taxes.${index}.description`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sm:sr-only">Descripción</FormLabel>
              <FormControl>
                <Input placeholder={kind === 'OTHER_TAX' ? 'Qué tributo es' : 'Detalle (opcional)'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={form.control}
        name={`taxes.${index}.amount`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sm:sr-only">Importe</FormLabel>
            <FormControl>
              <Input inputMode="decimal" placeholder="Importe" className="text-right tabular-nums" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 justify-self-end" aria-label="Quitar el tributo" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
