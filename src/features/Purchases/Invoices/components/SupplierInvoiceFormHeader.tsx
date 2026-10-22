'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { CBTE_TYPES, type VoucherLetter } from '@/shared/lib/arca/catalogs';
import moment from 'moment';
import { type UseFormReturn } from 'react-hook-form';
import { searchSupplierOptions } from '../../actions/suppliers.server';
import { expectedSupplierLetter } from '../../lib/invoice-letter';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { SUPPLIER_INVOICE_CBTE_TYPES } from '../../schemas/invoices';
import { kindOf, type FormValues } from './supplier-invoice-form-model';

export function SupplierInvoiceFormHeader({
  form,
  supplierLabel,
  supplierId,
  letter,
  kind,
  expected,
  invoices,
  onSupplierChange,
  onTypeChange,
  onIssueDateChange,
}: {
  form: UseFormReturn<FormValues>;
  supplierLabel: string | null;
  supplierId: string;
  letter: VoucherLetter | null;
  kind: ReturnType<typeof kindOf>;
  expected: ReturnType<typeof expectedSupplierLetter> | null;
  invoices: SupplierInvoiceFormData['invoices'];
  onSupplierChange: (option: { id: string; label: string } | null) => void;
  onTypeChange: (next: number) => void;
  onIssueDateChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos del comprobante</CardTitle>
        <CardDescription>Como figura en la factura del proveedor.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="supplierId"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Proveedor</FormLabel>
              <FormControl>
                <SearchCombobox
                  queryKey={['purchase-supplier-options']}
                  search={searchSupplierOptions}
                  value={field.value}
                  selectedLabel={supplierLabel}
                  onSelect={onSupplierChange}
                  placeholder="Elegí el proveedor"
                  searchPlaceholder="Razón social o CUIT…"
                  noun="proveedores"
                />
              </FormControl>
              {expected && (
                <FormDescription
                  className={
                    expected.ok && letter && expected.letter !== letter ? 'text-amber-700 dark:text-amber-400' : ''
                  }
                >
                  {expected.ok ? expected.reason : expected.error}
                  {expected.ok && letter && expected.letter !== letter && ' Si la cargás igual, queda observada.'}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cbteType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select value={String(field.value)} onValueChange={(value) => onTypeChange(Number(value))}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPLIER_INVOICE_CBTE_TYPES.map((id) => (
                    <SelectItem key={id} value={String(id)}>
                      {CBTE_TYPES[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-[2fr_3fr] gap-2">
          <InputFormField
            control={form.control}
            name="salesPoint"
            label="Punto de venta"
            inputMode="numeric"
            placeholder="0003"
          />
          <InputFormField
            control={form.control}
            name="number"
            label="Número"
            inputMode="numeric"
            placeholder="00012345"
          />
        </div>
        <FormField
          control={form.control}
          name="issueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de emisión</FormLabel>
              <FormControl>
                <EnhancedDatePicker
                  date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                  setDate={(date) => onIssueDateChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                  placeholder="DD/MM/AAAA"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vencimiento del pago (opcional)</FormLabel>
              <FormControl>
                <EnhancedDatePicker
                  date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                  setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                  placeholder="DD/MM/AAAA"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="vatPeriod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Período IVA</FormLabel>
              <FormControl>
                <Input type="month" {...field} />
              </FormControl>
              <FormDescription>
                El mes del Libro IVA. Si el comprobante llegó tarde, imputalo al mes en curso.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-[3fr_2fr] gap-2">
          <InputFormField
            control={form.control}
            name="cae"
            label="CAE (opcional)"
            inputMode="numeric"
            maxLength={14}
            placeholder="14 dígitos"
          />
          <FormField
            control={form.control}
            name="caeDueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vto. CAE</FormLabel>
                <FormControl>
                  <EnhancedDatePicker
                    date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                    setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                    placeholder="DD/MM/AAAA"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {kind !== 'invoice' && (
          <FormField
            control={form.control}
            name="relatedInvoiceId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Factura que corrige (opcional)</FormLabel>
                <Select
                  value={field.value || 'none'}
                  onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                >
                  <FormControl>
                    <SelectTrigger disabled={!supplierId}>
                      <SelectValue placeholder="Sin vincular" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Sin vincular</SelectItem>
                    {invoices
                      .filter((invoice) => letter && invoice.label.includes(`Factura ${letter} `))
                      .map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id}>
                          {invoice.label} · {moment(invoice.issueDate, 'YYYY-MM-DD').format('DD/MM/YYYY')} ·{' '}
                          {formatMoney(invoice.total)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="attachment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Comprobante escaneado (opcional)</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                />
              </FormControl>
              <FormDescription>PDF o imagen, hasta 10 MB.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextareaFormField
          control={form.control}
          name="notes"
          label="Observaciones (opcional)"
          itemClassName="md:col-span-2"
          rows={2}
        />
      </CardContent>
    </Card>
  );
}
