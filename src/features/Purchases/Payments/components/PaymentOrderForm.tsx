'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { DateFormField, InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { createPaymentOrder, previewPaymentOrder, updatePaymentOrder } from '../../actions/payment-orders.server';
import { getPaymentOrderFormData } from '../../actions/payment-queries.server';
import { searchSupplierOptions } from '../../actions/supplier-queries.server';
import { invalidatePurchases } from '../../lib/invalidate';
import type { PaymentOrderFormData } from '../../lib/payment-query-types';
import { paymentOrderFormSchema, type PaymentOrderFormValues } from '../../schemas/payment-orders';
import { type WithholdingTax } from '../../schemas/payment-settings';
import { PaymentItemGroup, type PaymentLine } from './PaymentItemGroup';
import { PaymentWithholdingsCard } from './PaymentWithholdingsCard';

const logger = new Logger('Purchases/PaymentOrderForm');

export type PaymentOrderFormMode = { kind: 'create' } | { kind: 'edit'; orderId: string; number: string };

type Line = PaymentLine;

const dmy = (value: string | null) => (value ? moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY') : 'Sin vencimiento');

/**
 * Armar o editar una orden de pago (spec Compras etapa 5 §5): proveedor, comprobantes pendientes
 * (total o parcial), NC y anticipos para aplicar, anticipo nuevo, retenciones calculadas en vivo
 * por el servidor (con correccion a mano) y el neto, con un solo Guardar.
 */
export function PaymentOrderForm({
  mode,
  initialValues,
  initialData,
  initialSupplierLabel,
}: {
  mode: PaymentOrderFormMode;
  initialValues: PaymentOrderFormValues;
  initialData: PaymentOrderFormData;
  initialSupplierLabel: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplierLabel, setSupplierLabel] = useState<string | null>(initialSupplierLabel);
  const [editingTax, setEditingTax] = useState<WithholdingTax | null>(null);
  const [manualDraft, setManualDraft] = useState({ amount: '', reason: '' });

  const form = useForm<PaymentOrderFormValues>({
    resolver: zodResolver(paymentOrderFormSchema),
    defaultValues: initialValues,
  });
  const values = useWatch({ control: form.control }) as PaymentOrderFormValues;
  const supplierId = values.supplierId;
  const lines = values.lines ?? [];

  const excludeOrderId = mode.kind === 'edit' ? mode.orderId : undefined;
  const { data: formData } = useQuery({
    queryKey: ['payment-order-form', supplierId, excludeOrderId ?? null],
    queryFn: () => getPaymentOrderFormData(supplierId || undefined, { excludeOrderId }),
    initialData: supplierId === (initialData.supplier?.id ?? '') ? initialData : undefined,
    staleTime: 30 * 1000,
  });
  const data = formData ?? null;

  // Vista previa del servidor (retenciones y totales) con los valores ya estables.
  const deferred = useDeferredValue(JSON.stringify(values));
  const hasSomething = Boolean(supplierId) && (lines.length > 0 || Boolean(values.advance?.amount));
  const preview = useQuery({
    queryKey: ['payment-order-preview', deferred, excludeOrderId ?? null],
    queryFn: async () =>
      unwrapAction(
        await previewPaymentOrder(JSON.parse(deferred) as PaymentOrderFormValues, { orderId: excludeOrderId })
      ),
    enabled: hasSomething && paymentOrderFormSchema.safeParse(JSON.parse(deferred)).success,
    retry: false,
    staleTime: 10 * 1000,
  });

  /** La clave de una línea: el anticipo de origen, el cheque rechazado o el comprobante. */
  const keyOf = (l: Line) =>
    l.kind === 'ADVANCE_APPLIED' ? l.sourceLineId : l.kind === 'REJECTED_CHECK' ? l.checkId ?? '' : l.invoiceId;
  const lineOf = (key: string, kind: Line['kind']) => lines.findIndex((l) => l.kind === kind && keyOf(l) === key);

  const toggle = (key: string, kind: Line['kind'], amount: string, checked: boolean) => {
    const next = lines.filter((_, i) => i !== lineOf(key, kind));
    if (checked) {
      next.push({
        kind,
        invoiceId: kind === 'INVOICE' || kind === 'CREDIT_NOTE' ? key : '',
        sourceLineId: kind === 'ADVANCE_APPLIED' ? key : '',
        checkId: kind === 'REJECTED_CHECK' ? key : '',
        amount,
      });
    }
    form.setValue('lines', next, { shouldValidate: form.formState.isSubmitted });
  };

  const setAmount = (key: string, kind: Line['kind'], amount: string) => {
    const index = lineOf(key, kind);
    if (index >= 0) form.setValue(`lines.${index}.amount`, amount, { shouldValidate: form.formState.isSubmitted });
  };

  const changeSupplier = (option: { id: string; label: string } | null) => {
    form.setValue('supplierId', option?.id ?? '', { shouldValidate: form.formState.isSubmitted });
    form.setValue('lines', []);
    form.setValue('advance', { amount: '', purchaseOrderId: '', description: '' });
    form.setValue('manualWithholdings', []);
    setSupplierLabel(option?.label ?? null);
  };

  const saveManual = (tax: WithholdingTax) => {
    const others = (values.manualWithholdings ?? []).filter((m) => m.tax !== tax);
    form.setValue('manualWithholdings', [...others, { tax, amount: manualDraft.amount, reason: manualDraft.reason }]);
    setEditingTax(null);
  };

  const removeManual = (tax: WithholdingTax) =>
    form.setValue(
      'manualWithholdings',
      (values.manualWithholdings ?? []).filter((m) => m.tax !== tax)
    );

  const save = useMutation({
    mutationFn: async (v: PaymentOrderFormValues) => {
      if (mode.kind === 'edit') {
        unwrapAction(await updatePaymentOrder(mode.orderId, v));
        return { id: mode.orderId, number: mode.number };
      }
      return unwrapAction(await createPaymentOrder(v));
    },
    onSuccess: (saved) => {
      const net = preview.data?.totals.netTotal;
      toast.success(`${saved.number} guardada en borrador${net ? `: neto a pagar ${formatMoney(net)}` : ''}`, {
        description: 'Enviala a aprobación desde el detalle.',
      });
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/payments/${saved.id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la orden de pago', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la orden de pago');
    },
  });

  const debts = data?.openItems.invoices.filter((i) => !i.isCredit) ?? [];
  const credits = data?.openItems.invoices.filter((i) => i.isCredit) ?? [];
  const advances = data?.openItems.advances ?? [];
  const checkDebts = data?.openItems.checkDebts ?? [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proveedor y fecha</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
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
                      value={field.value}
                      selectedLabel={supplierLabel}
                      onSelect={changeSupplier}
                      placeholder="Elegí el proveedor"
                      searchPlaceholder="Razón social o CUIT…"
                      noun="proveedores"
                      disabled={mode.kind === 'edit'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DateFormField
              control={form.control}
              name="plannedOn"
              label="Fecha prevista de pago"
              description="Las retenciones se calculan para este mes. El pago se registra en el mismo mes."
            />
          </CardContent>
        </Card>

        {supplierId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qué se paga</CardTitle>
              <CardDescription>Tildá los comprobantes y ajustá el importe si es un pago parcial.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <PaymentItemGroup
                title="Comprobantes pendientes"
                empty="El proveedor no tiene comprobantes a pagar."
                items={debts.map((i) => ({
                  key: i.id,
                  title: i.label,
                  subtitle: `${i.dueDate ? `Vence ${dmy(i.dueDate)}` : 'Sin vencimiento'} · total ${formatMoney(i.total)}`,
                  max: i.pending,
                  maxLabel: 'pendiente',
                }))}
                kind="INVOICE"
                lines={lines}
                lineOf={lineOf}
                onToggle={toggle}
                onAmount={setAmount}
              />
              {checkDebts.length > 0 && (
                <PaymentItemGroup
                  title="Cheques de terceros endosados y rechazados (sin retenciones)"
                  empty=""
                  items={checkDebts.map((d) => ({
                    key: d.checkId,
                    title: d.label,
                    subtitle: `Rechazado el ${dmy(d.rejectedOn)}`,
                    max: d.pending,
                    maxLabel: 'se debe',
                  }))}
                  kind="REJECTED_CHECK"
                  lines={lines}
                  lineOf={lineOf}
                  onToggle={toggle}
                  onAmount={setAmount}
                />
              )}
              {credits.length > 0 && (
                <PaymentItemGroup
                  title="Notas de crédito para aplicar (restan)"
                  empty=""
                  items={credits.map((i) => ({
                    key: i.id,
                    title: i.label,
                    subtitle: `Emitida ${dmy(i.issueDate)}`,
                    max: i.pending,
                    maxLabel: 'disponible',
                  }))}
                  kind="CREDIT_NOTE"
                  lines={lines}
                  lineOf={lineOf}
                  onToggle={toggle}
                  onAmount={setAmount}
                />
              )}
              {advances.length > 0 && (
                <PaymentItemGroup
                  title="Anticipos para aplicar (restan)"
                  empty=""
                  items={advances.map((a) => ({
                    key: a.lineId,
                    title: `Anticipo de la ${a.orderNumber}`,
                    subtitle: `${a.description ?? 'Sin descripción'} · pagado ${dmy(a.paidOn)}`,
                    max: a.available,
                    maxLabel: 'disponible',
                  }))}
                  kind="ADVANCE_APPLIED"
                  lines={lines}
                  lineOf={lineOf}
                  onToggle={toggle}
                  onAmount={setAmount}
                />
              )}
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-sm font-medium">Anticipo (opcional)</Label>
                <p className="text-xs text-muted-foreground">
                  Un pago a cuenta sin factura. Queda disponible para aplicar a una factura más adelante.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InputFormField
                    control={form.control}
                    name="advance.amount"
                    label="Importe"
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                  <FormField
                    control={form.control}
                    name="advance.purchaseOrderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contra la OC (opcional)</FormLabel>
                        <Select
                          value={field.value || 'none'}
                          onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Sin OC</SelectItem>
                            {(data?.purchaseOrders ?? []).map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.number} · {formatMoney(o.total)}
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
                    name="advance.description"
                    label="Descripción"
                    placeholder="Anticipo 30 % de la obra"
                  />
                </div>
              </div>
              {form.formState.errors.lines?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.lines.message}</p>
              )}
            </CardContent>
          </Card>
        )}

        {hasSomething && (
          <PaymentWithholdingsCard
            preview={preview}
            editingTax={editingTax}
            manualDraft={manualDraft}
            onManualDraftChange={setManualDraft}
            onEdit={(tax, amount) => {
              setManualDraft({ amount, reason: '' });
              setEditingTax(tax);
            }}
            onSaveManual={saveManual}
            onRemoveManual={removeManual}
          />
        )}

        <Card>
          <CardContent className="pt-6">
            <TextareaFormField control={form.control} name="notes" label="Observaciones (opcional)" rows={2} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending || !hasSomething || preview.isError}>
            <Banknote className="mr-1 h-4 w-4" />
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
