'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createPurchaseQuote, updatePurchaseQuoteDraft } from '../../actions/quotes.server';
import { searchSupplierOptions } from '../../actions/supplier-queries.server';
import { invalidatePurchases } from '../../lib/invalidate';
import type { OrderableRequestLineOption } from '../../lib/order-query-types';
import { lineOptionLabel, searchLineOptions } from '../../lib/orderable-line-options';
import { purchaseQuoteFormSchema, type PurchaseQuoteFormValues } from '../../schemas/quotes';

const logger = new Logger('Purchases/PurchaseQuoteForm');

export type QuoteFormMode = { kind: 'create' } | { kind: 'edit'; quoteId: string; number: string };

interface PurchaseQuoteFormProps {
  mode: QuoteFormMode;
  defaultValues: PurchaseQuoteFormValues;
  initialSupplierLabel: string | null;
  initialLines: Record<string, OrderableRequestLineOption>;
}

/**
 * Pedido de cotizacion a un proveedor con lineas de cualquier solicitud con faltante. Se pide lo
 * que falta de cada linea (lo calcula el servidor al guardar).
 */
export function PurchaseQuoteForm({ mode, defaultValues, initialSupplierLabel, initialLines }: PurchaseQuoteFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplierLabel, setSupplierLabel] = useState(initialSupplierLabel);
  const [known, setKnown] = useState(initialLines);

  const form = useForm<PurchaseQuoteFormValues>({ resolver: zodResolver(purchaseQuoteFormSchema), defaultValues });

  const save = useMutation({
    mutationFn: async (values: PurchaseQuoteFormValues) => {
      if (mode.kind === 'edit') {
        unwrapAction(await updatePurchaseQuoteDraft(mode.quoteId, values));
        return { id: mode.quoteId, number: mode.number };
      }
      return unwrapAction(await createPurchaseQuote(values));
    },
    onSuccess: ({ id, number }) => {
      toast.success(mode.kind === 'edit' ? `Pedido ${number} guardado` : `Pedido de cotización ${number} creado`);
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/quotes/${id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el pedido de cotización', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el pedido de cotización');
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proveedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>A quién se le pide</FormLabel>
                  <FormControl>
                    <SearchCombobox
                      queryKey={['purchase-supplier-options']}
                      search={searchSupplierOptions}
                      value={field.value}
                      selectedLabel={supplierLabel}
                      onSelect={(option) => {
                        field.onChange(option?.id ?? '');
                        setSupplierLabel(option?.label ?? null);
                      }}
                      placeholder="Elegí el proveedor"
                      searchPlaceholder="Razón social o CUIT…"
                      noun="proveedores"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <TextareaFormField
              control={form.control}
              name="notes"
              label="Observaciones para el proveedor (opcional)"
              rows={2}
              placeholder="Van en el PDF del pedido"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qué se cotiza</CardTitle>
            <CardDescription>
              Líneas de solicitudes aprobadas con faltante. Se pide lo que falta de cada una.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="requestLineIds"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SearchCombobox
                      queryKey={['purchase-orderable-lines']}
                      search={searchLineOptions}
                      value=""
                      selectedLabel={null}
                      onSelect={(option) => {
                        if (!option || field.value.includes(option.id)) return;
                        setKnown((prev) => ({ ...prev, [option.id]: option }));
                        field.onChange([...field.value, option.id]);
                      }}
                      placeholder="Agregar línea…"
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
                  <ul className="divide-y rounded-md border">
                    {field.value.length === 0 && (
                      <li className="p-3 text-sm text-muted-foreground">Todavía no agregaste líneas.</li>
                    )}
                    {field.value.map((id) => {
                      const line = known[id];
                      return (
                        <li key={id} className="flex items-center gap-2 p-2 text-sm">
                          <span className="min-w-0 flex-1">
                            {line ? lineOptionLabel(line) : 'Línea'}
                            {line && (
                              <span className="ml-1 text-muted-foreground tabular-nums">
                                · falta {formatQuantity(line.remaining)} {line.unitAbbr}
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Quitar la línea"
                            onClick={() => field.onChange(field.value.filter((value) => value !== id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : mode.kind === 'edit' ? 'Guardar' : 'Crear pedido'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
