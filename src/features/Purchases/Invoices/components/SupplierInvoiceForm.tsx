'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { DEFAULT_VAT_RATE_ID } from '@/shared/lib/arca/catalogs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createSupplierInvoice,
  updateSupplierInvoice,
  uploadSupplierInvoiceAttachment,
} from '../../actions/invoices.server';
import { getSupplierInvoiceFormData } from '../../actions/invoice-queries.server';
import type { SupplierInvoiceFormData } from '../../lib/invoice-query-types';
import { convertOrderLineForLetter, expectedOrderPrice } from '../../lib/invoice-form';
import { expectedSupplierLetter } from '../../lib/invoice-letter';
import { SUPPLIER_INVOICE_OBSERVATION_LABELS } from '../../lib/invoice-status';
import { computeInvoiceLine, computeSupplierInvoiceTotals, vatBreakdown } from '../../lib/invoice-totals';
import { invalidatePurchases } from '../../lib/invalidate';
import { trimDecimals } from '../../lib/quantity-format';
import { type SupplierInvoiceFormValues } from '../../schemas/invoices';
import { type FormValues, type OrderLineOption, emptyValues, formSchema, kindOf, letterOf } from './supplier-invoice-form-model';
import { OrderLinesPicker } from './OrderLinesPicker';
import { SupplierInvoiceFormHeader } from './SupplierInvoiceFormHeader';
import { SupplierInvoiceFormLines } from './SupplierInvoiceFormLines';
import { SupplierInvoiceTotals } from './SupplierInvoiceTotals';
import { SupplierInvoiceVatTaxes } from './SupplierInvoiceVatTaxes';

export type SupplierInvoiceFormMode = { kind: 'create' } | { kind: 'edit'; invoiceId: string; label: string };

const logger = new Logger('Purchases/SupplierInvoiceForm');

/**
 * Cargar o editar un comprobante de proveedor (spec Compras etapa 4 §4): datos, lineas (desde OC o
 * gastos), IVA por alicuota, tributos y total en vivo, con un solo Guardar. El control lo hace el
 * servidor; la fila avisa antes de guardar si el precio o la alicuota difieren de la OC.
 */
export function SupplierInvoiceForm({
  mode,
  initialValues,
  initialData,
  initialSupplierLabel,
}: {
  mode: SupplierInvoiceFormMode;
  initialValues?: SupplierInvoiceFormValues;
  initialData: SupplierInvoiceFormData;
  initialSupplierLabel?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplierLabel, setSupplierLabel] = useState<string | null>(initialSupplierLabel ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues ? { ...initialValues, attachment: null } : emptyValues(),
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const taxes = useFieldArray({ control: form.control, name: 'taxes' });

  const supplierId = useWatch({ control: form.control, name: 'supplierId' });
  const cbteType = useWatch({ control: form.control, name: 'cbteType' });
  const watchedLines = useWatch({ control: form.control, name: 'lines' });
  const watchedVat = useWatch({ control: form.control, name: 'vat' });
  const watchedTaxes = useWatch({ control: form.control, name: 'taxes' });
  const untaxed = useWatch({ control: form.control, name: 'untaxed' });
  const exempt = useWatch({ control: form.control, name: 'exempt' });

  const excludeInvoiceId = mode.kind === 'edit' ? mode.invoiceId : undefined;
  const { data: formData, isFetching: loadingSupplier } = useQuery({
    queryKey: ['supplier-invoice-form', supplierId, excludeInvoiceId ?? null],
    queryFn: () => getSupplierInvoiceFormData(supplierId || undefined, { excludeInvoiceId }),
    initialData: supplierId === (initialData.supplier?.id ?? '') ? initialData : undefined,
    staleTime: 30 * 1000,
  });
  const data = formData ?? null;

  const letter = letterOf(cbteType);
  const kind = kindOf(cbteType);
  const expected = data?.supplier
    ? expectedSupplierLetter({
        supplierVatConditionId: data.supplier.vat_condition_id,
        supplierName: data.supplier.name,
        companyTaxCondition: data.companyTaxCondition,
      })
    : null;

  const orderLines = useMemo(() => {
    const map = new Map<string, OrderLineOption>();
    for (const order of data?.orders ?? []) {
      for (const line of order.lines) map.set(line.orderLineId, { ...line, orderId: order.id, orderNumber: order.number });
    }
    return map;
  }, [data]);

  // Importes en vivo (las lineas invalidas no suman: el schema las marca con su error).
  const amounts = (watchedLines ?? []).map((line) =>
    letter
      ? line.kind === 'order'
        ? computeInvoiceLine({ letter, quantity: line.quantity, unitPrice: line.unitPrice, vatRateId: line.vatRateId ? Number(line.vatRateId) : null })
        : computeInvoiceLine({ letter, net: line.net, vatRateId: line.vatRateId ? Number(line.vatRateId) : null })
      : null
  );
  const computedVat = letter
    ? vatBreakdown(
        amounts.flatMap((a, i) => (a ? [{ netTotal: a.netTotal, vatRateId: watchedLines[i]?.vatRateId ? Number(watchedLines[i]!.vatRateId) : null }] : [])),
        letter
      )
    : [];
  // `vat` del form guarda solo lo que el usuario corrigio; el resto es el calculado.
  const vatShown = computedVat.map((v) => ({ ...v, amount: watchedVat?.find((o) => o.vatRateId === v.vatRateId)?.amount ?? v.amount }));
  const totals = computeSupplierInvoiceTotals({
    lines: amounts.flatMap((a) => (a ? [a] : [])),
    vat: vatShown,
    untaxed,
    exempt,
    taxes: watchedTaxes ?? [],
  });

  const changeType = (next: number) => {
    const before = letterOf(form.getValues('cbteType'));
    const after = letterOf(next);
    form.setValue('cbteType', next, { shouldValidate: form.formState.isSubmitted });
    if (kindOf(next) === 'invoice') form.setValue('relatedInvoiceId', '');
    if (before && after && before !== after) {
      // C no discrimina IVA: las lineas de OC pasan de neto a final (o al reves) y recuperan la
      // alicuota de su OC; los gastos van sin alicuota en C y con la de defecto al salir de C.
      form.setValue('vat', []);
      form.getValues('lines').forEach((line, i) => {
        const source = line.kind === 'order' ? orderLines.get(line.orderLineId) : undefined;
        if (source) {
          const converted = convertOrderLineForLetter(line, source, before, after);
          form.setValue(`lines.${i}.unitPrice`, converted.unitPrice);
          form.setValue(`lines.${i}.vatRateId`, converted.vatRateId);
        } else if (after === 'C') {
          form.setValue(`lines.${i}.vatRateId`, '');
        } else if (before === 'C') {
          form.setValue(`lines.${i}.vatRateId`, String(DEFAULT_VAT_RATE_ID));
        }
      });
    }
  };

  const changeIssueDate = (value: string) => {
    const previousMonth = form.getValues('issueDate').slice(0, 7);
    form.setValue('issueDate', value, { shouldValidate: form.formState.isSubmitted });
    // El periodo acompaña al mes de emision mientras el usuario no lo haya movido.
    if (value && form.getValues('vatPeriod') === previousMonth) form.setValue('vatPeriod', value.slice(0, 7));
  };

  const changeSupplier = (option: { id: string; label: string } | null) => {
    form.setValue('supplierId', option?.id ?? '', { shouldValidate: form.formState.isSubmitted });
    setSupplierLabel(option?.label ?? null);
    form.setValue('relatedInvoiceId', '');
    // Las lineas de OC son del proveedor anterior.
    const keep = form.getValues('lines').filter((line) => line.kind === 'expense');
    form.setValue('lines', keep);
  };

  const setVatAmount = (vatRateId: number, amount: string) => {
    const others = (form.getValues('vat') ?? []).filter((v) => v.vatRateId !== vatRateId);
    form.setValue('vat', [...others, { vatRateId, amount }]);
  };

  const addOrderLines = (selected: (OrderLineOption & { quantity: string })[]) => {
    for (const line of selected) {
      lines.append({
        kind: 'order',
        orderLineId: line.orderLineId,
        expenseCategoryId: '',
        description: '',
        quantity: line.quantity,
        unitPrice: trimDecimals(expectedOrderPrice(line, letter ?? 'A')),
        net: '',
        vatRateId: letter === 'C' ? '' : String(line.vatRateId),
      });
    }
    setPickerOpen(false);
  };

  const addExpense = () =>
    lines.append({
      kind: 'expense',
      orderLineId: '',
      expenseCategoryId: data?.categories.length === 1 ? data.categories[0]!.id : '',
      description: '',
      quantity: '',
      unitPrice: '',
      net: '',
      vatRateId: letter === 'C' ? '' : String(DEFAULT_VAT_RATE_ID),
    });

  const save = useMutation({
    mutationFn: async ({ attachment, ...values }: FormValues) => {
      // Solo viajan las correcciones de IVA de alicuotas que siguen en las lineas.
      const rates = new Set(computedVat.map((v) => v.vatRateId));
      const payload = { ...values, vat: letter === 'C' ? [] : values.vat.filter((v) => rates.has(v.vatRateId)) };
      const saved = unwrapAction(
        mode.kind === 'edit' ? await updateSupplierInvoice(mode.invoiceId, payload) : await createSupplierInvoice(payload)
      );
      let attachError: string | null = null;
      if (attachment) {
        const body = new FormData();
        body.set('file', attachment);
        const uploaded = await uploadSupplierInvoiceAttachment(saved.id, body);
        if (!uploaded.ok) attachError = uploaded.error;
      }
      return { ...saved, attachError };
    },
    onSuccess: (saved) => {
      const verb = mode.kind === 'edit' ? 'guardada' : 'cargada';
      if (saved.status === 'OBSERVED') {
        const kinds = [...new Set(saved.observations.map((o) => SUPPLIER_INVOICE_OBSERVATION_LABELS[o.code]))].join(', ');
        const n = saved.observations.length;
        toast.warning(`${saved.label} ${verb}: observada, ${n} ${n === 1 ? 'diferencia' : 'diferencias'} (${kinds})`, {
          description: 'Quien tenga permiso de aprobar la revisa en el detalle.',
        });
      } else {
        toast.success(`${saved.label} ${verb}: conforme`);
      }
      if (saved.attachError) toast.warning('El comprobante quedó guardado, pero no se pudo subir el archivo', { description: saved.attachError });
      invalidatePurchases(queryClient);
      router.push(`/dashboard/purchases/invoices/${saved.id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el comprobante', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el comprobante');
    },
  });

  const linesError = form.formState.errors.lines;


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <SupplierInvoiceFormHeader
          form={form}
          supplierLabel={supplierLabel}
          supplierId={supplierId}
          letter={letter}
          kind={kind}
          expected={expected}
          invoices={data?.invoices ?? []}
          onSupplierChange={changeSupplier}
          onTypeChange={changeType}
          onIssueDateChange={changeIssueDate}
        />

        <SupplierInvoiceFormLines
          form={form}
          lines={lines}
          supplierId={supplierId}
          loadingSupplier={loadingSupplier}
          letter={letter}
          orderLines={orderLines}
          watchedLines={watchedLines}
          categories={data?.categories ?? []}
          amounts={amounts}
          linesError={linesError}
          onPickFromOrders={() => setPickerOpen(true)}
          onAddExpense={addExpense}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">IVA, tributos y total</CardTitle>
            <CardDescription>
              {letter === 'C'
                ? 'Un comprobante C no discrimina IVA.'
                : 'El IVA de cada alícuota se calcula de las líneas. Si el proveedor redondeó distinto, corregilo: más de $1 de diferencia la deja observada.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SupplierInvoiceVatTaxes
              form={form}
              taxes={taxes}
              vatShown={vatShown}
              provinces={data?.provinces ?? []}
              onVatAmountChange={setVatAmount}
            />

            <Separator />
            <SupplierInvoiceTotals letter={letter} totals={totals} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <ReceiptText className="mr-1 h-4 w-4" />
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>

      <OrderLinesPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        orders={data?.orders ?? []}
        kind={kind}
        alreadyAdded={new Set((watchedLines ?? []).map((l) => l.orderLineId).filter(Boolean))}
        onAdd={addOrderLines}
      />
    </Form>
  );
}
