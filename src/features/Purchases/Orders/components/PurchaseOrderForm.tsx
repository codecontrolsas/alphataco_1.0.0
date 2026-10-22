'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { VAT_RATES } from '@/shared/lib/arca/catalogs';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { getSupplierPurchaseContext } from '../../actions/order-queries.server';
import { createPurchaseOrder, updatePurchaseOrderDraft } from '../../actions/orders.server';
import { searchSupplierOptions } from '../../actions/suppliers.server';
import { ExpiredSupplierDocumentsAlert } from '../../components/ExpiredSupplierDocumentsAlert';
import { invalidatePurchases } from '../../lib/invalidate';
import type { OrderableRequestLineOption } from '../../lib/order-query-types';
import { computeOrderTotals } from '../../lib/order-totals';
import { emptyPurchaseOrderLine, purchaseOrderFormSchema, type PurchaseOrderFormValues } from '../../schemas/orders';
import { OrderLineFields } from './PurchaseOrderLineFields';

const logger = new Logger('Purchases/PurchaseOrderForm');

const VAT_RATE_IDS = Object.keys(VAT_RATES).map(Number) as (keyof typeof VAT_RATES)[];

export type PurchaseOrderFormMode = { kind: 'create' } | { kind: 'edit'; orderId: string; number: string };

/** Lineas de solicitud conocidas por id (las elegidas y las precargadas), para mostrar su faltante. */
export type LineOptions = Record<string, OrderableRequestLineOption>;

interface PurchaseOrderFormProps {
  mode: PurchaseOrderFormMode;
  defaultValues: PurchaseOrderFormValues;
  initialSupplierLabel: string | null;
  initialLineOptions: LineOptions;
  /** OC complementaria: solo se corrigen precio, alicuota, notas y condiciones (lo demas es lo que llego). */
  complement?: boolean;
}

/**
 * Orden de compra en un solo formulario: proveedor (con aviso de documentos vencidos y plazo de
 * pago precargado), lineas tomadas de solicitudes con faltante, condiciones y totales en vivo.
 * Los totales que valen son los del servidor; aca son vista previa con la misma funcion.
 */
export function PurchaseOrderForm({
  mode,
  defaultValues,
  initialSupplierLabel,
  initialLineOptions,
  complement = false,
}: PurchaseOrderFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplierLabel, setSupplierLabel] = useState<string | null>(initialSupplierLabel);
  const [lineOptions, setLineOptions] = useState<LineOptions>(initialLineOptions);

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues,
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const supplierId = useWatch({ control: form.control, name: 'supplierId' });
  const watchedLines = useWatch({ control: form.control, name: 'lines' });
  const totals = computeOrderTotals(watchedLines ?? []);

  const supplier = useQuery({
    queryKey: ['purchase-supplier-context', supplierId],
    queryFn: () => getSupplierPurchaseContext(supplierId),
    enabled: Boolean(supplierId),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async ({ values, submit }: { values: PurchaseOrderFormValues; submit: boolean }) => {
      if (mode.kind === 'edit') {
        unwrapAction(await updatePurchaseOrderDraft(mode.orderId, values));
        return { id: mode.orderId, number: mode.number, submit };
      }
      return { ...unwrapAction(await createPurchaseOrder(values, { submit })), submit };
    },
    onSuccess: ({ id, number, submit }) => {
      toast.success(
        mode.kind === 'edit'
          ? `Orden ${number} guardada`
          : submit
            ? `Orden ${number} enviada a aprobación`
            : `Orden ${number} guardada como borrador`
      );
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/orders/${id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la orden de compra', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la orden de compra');
    },
  });

  const submitWith = (submit: boolean) => form.handleSubmit((values) => save.mutate({ values, submit }));

  return (
    <Form {...form}>
      {/* Enter guarda borrador: enviar a aprobacion es siempre un click explicito. */}
      <form onSubmit={submitWith(false)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proveedor y condiciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proveedor</FormLabel>
                  <FormControl>
                    <SearchCombobox
                      queryKey={['purchase-supplier-options']}
                      search={searchSupplierOptions}
                      disabled={complement}
                      value={field.value}
                      selectedLabel={supplierLabel}
                      onSelect={(option) => {
                        field.onChange(option?.id ?? '');
                        setSupplierLabel(option?.label ?? null);
                        form.setValue('paymentTermDays', '');
                        // Los precios cotizados son de otro proveedor: las lineas dejan de venir de la cotizacion.
                        form.getValues('lines').forEach((_, i) => form.setValue(`lines.${i}.quoteLineId`, ''));
                      }}
                      placeholder="Elegí el proveedor"
                      searchPlaceholder="Razón social o CUIT…"
                      noun="proveedores"
                      renderOption={(o) => (
                        <span className="flex flex-col">
                          <span>{o.label}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{o.cuit}</span>
                        </span>
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {supplier.data && (
              <ExpiredSupplierDocumentsAlert supplierId={supplier.data.id} documents={supplier.data.expiredDocuments} />
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de entrega (opcional)</FormLabel>
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
              <InputFormField
                control={form.control}
                name="deliveryPlace"
                label="Lugar de entrega (opcional)"
                placeholder="Base Neuquén, obrador Añelo…"
              />
              <FormField
                control={form.control}
                name="paymentTermDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plazo de pago (días)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        className="tabular-nums"
                        placeholder={
                          supplier.data?.paymentTermDays != null
                            ? `${supplier.data.paymentTermDays} (del proveedor)`
                            : 'Sin plazo'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Vacío: el de la ficha del proveedor.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <TextareaFormField
              control={form.control}
              name="notes"
              label="Observaciones (opcional)"
              rows={2}
              placeholder="Van en el PDF de la orden"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Qué se compra</CardTitle>
              <CardDescription>
                {complement
                  ? 'OC complementaria: las cantidades son las que llegaron de más. Solo se corrigen el precio y la alícuota.'
                  : 'Líneas de solicitudes aprobadas con faltante. Se pueden juntar líneas de varias solicitudes.'}
              </CardDescription>
            </div>
            {!complement && (
              <Button type="button" size="sm" variant="outline" onClick={() => lines.append(emptyPurchaseOrderLine())}>
                <Plus className="mr-1 h-4 w-4" />
                Agregar línea
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.fields.map((field, index) => (
              <div key={field.id}>
                {index > 0 && <Separator className="mb-4" />}
                <OrderLineFields
                  form={form}
                  index={index}
                  option={lineOptions[watchedLines?.[index]?.requestLineId ?? ''] ?? null}
                  canRemove={!complement && lines.fields.length > 1}
                  locked={complement}
                  onRemove={() => lines.remove(index)}
                  onOption={(option) => setLineOptions((prev) => ({ ...prev, [option.requestLineId]: option }))}
                />
              </div>
            ))}
            {form.formState.errors.lines?.root?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.lines.root.message}</p>
            )}
            <Separator />
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm tabular-nums">
              <dt className="text-muted-foreground">Subtotal neto</dt>
              <dd className="text-right">{formatMoney(totals.subtotal)}</dd>
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="text-right">{formatMoney(totals.vatTotal)}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-medium">{formatMoney(totals.total)}</dd>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="secondary" onClick={submitWith(false)} disabled={save.isPending}>
            {mode.kind === 'edit' ? 'Guardar borrador' : 'Guardar como borrador'}
          </Button>
          {mode.kind !== 'edit' && (
            <Button type="button" onClick={submitWith(true)} disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Enviar a aprobación'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
