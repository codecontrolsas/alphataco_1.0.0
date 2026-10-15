'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type VoucherLetter } from '@/shared/lib/arca/catalogs';
import { PackagePlus, Plus } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { type FormValues, type OrderLineOption } from './supplier-invoice-form-model';
import { InvoiceLineFields } from './SupplierInvoiceLineFields';
import type { FieldErrors, UseFieldArrayReturn } from 'react-hook-form';

export function SupplierInvoiceFormLines({
  form,
  lines,
  supplierId,
  loadingSupplier,
  letter,
  orderLines,
  watchedLines,
  categories,
  amounts,
  linesError,
  onPickFromOrders,
  onAddExpense,
}: {
  form: UseFormReturn<FormValues>;
  lines: UseFieldArrayReturn<FormValues, 'lines'>;
  supplierId: string;
  loadingSupplier: boolean;
  letter: VoucherLetter | null;
  orderLines: Map<string, OrderLineOption>;
  watchedLines: FormValues['lines'] | undefined;
  categories: SupplierInvoiceFormData['categories'];
  amounts: ({ netTotal: string; vatAmount: string } | null)[];
  linesError: FieldErrors<FormValues>['lines'];
  onPickFromOrders: () => void;
  onAddExpense: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Líneas</CardTitle>
          <CardDescription>Desde una OC del proveedor (lo recibido y no facturado) o gastos sin OC.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!supplierId || loadingSupplier} onClick={onPickFromOrders}>
            <PackagePlus className="mr-1 h-4 w-4" />
            Agregar desde OC
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onAddExpense}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar gasto
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.fields.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {supplierId ? 'Agregá las líneas del comprobante.' : 'Elegí el proveedor para traer sus OC, o agregá un gasto.'}
          </p>
        )}
        {lines.fields.map((field, index) => (
          <InvoiceLineFields
            key={field.id}
            form={form}
            index={index}
            letter={letter}
            orderLine={orderLines.get(watchedLines?.[index]?.orderLineId ?? '') ?? null}
            categories={categories}
            amount={amounts[index] ?? null}
            onRemove={() => lines.remove(index)}
          />
        ))}
        {linesError?.message && <p className="text-sm text-destructive">{linesError.message}</p>}
        {linesError?.root?.message && <p className="text-sm text-destructive">{linesError.root.message}</p>}
      </CardContent>
    </Card>
  );
}
