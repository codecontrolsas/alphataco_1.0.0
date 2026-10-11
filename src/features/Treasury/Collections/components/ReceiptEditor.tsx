'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Save, Trash2 } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { searchCollectionCustomers } from '../../actions/customer-statement.server';
import { confirmReceipt, deleteReceiptDraft, getReceiptFormData, saveReceiptDraft, type ReceiptFormData } from '../../actions/receipts.server';
import { attachWithholdingCertificate } from '../../actions/withholdings.server';
import { invalidateTreasury } from '../../lib/invalidate';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';
import { previewReceipt } from '../../lib/receipt-preview';
import { receiptFormSchema, type ReceiptFormValues } from '../../schemas/receipts';
import { ReceiptAdvancesSection } from './ReceiptAdvancesSection';
import { ReceiptInvoicesSection } from './ReceiptInvoicesSection';
import { ReceiptPaymentsSection } from './ReceiptPaymentsSection';
import { ReceiptSummary } from './ReceiptSummary';
import { ReceiptWithholdingsSection } from './ReceiptWithholdingsSection';

const logger = new Logger('Treasury/ReceiptEditor');

export type ReceiptEditorMode = { kind: 'create' } | { kind: 'edit'; receiptId: string };

/** Certificados elegidos en el editor, por id de campo de la fila de retención (se suben al guardar). */
export type PendingCertificates = Record<string, File>;

/**
 * Editor del recibo de cobranza (spec Tesorería etapa 2 §4.3): un solo formulario con cabecera,
 * comprobantes, anticipos, cobro a cuenta, retenciones y medios, y el cierre en vivo. "Guardar
 * borrador" no toca saldos; "Confirmar" (solo si cierra) toma número y mueve las cuentas.
 */
export function ReceiptEditor({
  mode,
  initialValues,
  initialData,
  canDelete,
}: {
  mode: ReceiptEditorMode;
  initialValues: ReceiptFormValues;
  initialData: ReceiptFormData;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const receiptId = mode.kind === 'edit' ? mode.receiptId : null;
  const [customerLabel, setCustomerLabel] = useState<string | null>(initialData.customer?.label ?? null);
  const [certificates, setCertificates] = useState<PendingCertificates>({});
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<ReceiptFormValues>({ resolver: zodResolver(receiptFormSchema), defaultValues: initialValues });
  const values = useWatch({ control: form.control }) as ReceiptFormValues;
  const withholdingRows = useFieldArray({ control: form.control, name: 'withholdings' });
  const customerId = values.customerId;

  const { data: fetched } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.receiptForm, receiptId, customerId],
    queryFn: () => getReceiptFormData({ receiptId: receiptId ?? undefined, customerId: customerId || undefined }),
    initialData: customerId === (initialData.customer?.id ?? '') ? initialData : undefined,
    enabled: Boolean(customerId),
    staleTime: 30 * 1000,
  });
  const data = fetched ?? (customerId ? null : initialData);

  const invoiceInfo = Object.fromEntries((data?.openInvoices ?? []).map((i) => [i.invoiceId, { currency: i.currency, exchangeRate: i.exchangeRate }]));
  const preview = previewReceipt(values, invoiceInfo);
  const isEmpty = values.invoices.length === 0 && values.advancesApplied.length === 0 && !values.advance.amount;

  const changeCustomer = (option: { id: string; label: string } | null) => {
    form.setValue('customerId', option?.id ?? '', { shouldValidate: form.formState.isSubmitted });
    form.setValue('invoices', []);
    form.setValue('advancesApplied', []);
    form.setValue('rates', []);
    setCustomerLabel(option?.label ?? null);
  };

  /** Sube los certificados elegidos a las retenciones ya guardadas. Devuelve cuántos fallaron. */
  const uploadCertificates = async (withholdingIds: string[]) => {
    let failed = 0;
    for (const [index, row] of withholdingRows.fields.entries()) {
      const file = certificates[row.id];
      const id = withholdingIds[index];
      if (!file || !id) continue;
      const data = new FormData();
      data.set('file', file);
      const result = await attachWithholdingCertificate(id, data);
      if (!result.ok) {
        failed += 1;
        logger.warn('No se pudo subir un certificado', { data: { error: result.error } });
      }
    }
    setCertificates({});
    return failed;
  };

  const afterWrite = async (withholdingIds: string[]) => {
    const failed = await uploadCertificates(withholdingIds);
    // Las retenciones nuevas ya tienen id: el próximo guardado las actualiza en vez de recrearlas.
    withholdingIds.forEach((id, index) => form.setValue(`withholdings.${index}.id`, id));
    if (failed > 0) toast.warning(`${failed === 1 ? 'Un certificado no se pudo subir' : `${failed} certificados no se pudieron subir`}: adjuntalos desde el recibo.`);
    invalidateTreasury(queryClient);
  };

  const save = useMutation({
    mutationFn: async (v: ReceiptFormValues) => unwrapAction(await saveReceiptDraft(receiptId, v)),
    onSuccess: async (saved) => {
      await afterWrite(saved.withholdingIds);
      toast.success('Borrador guardado', { description: preview.closes ? 'Cierra: ya se puede confirmar.' : preview.closing });
      // Una ruta nueva ya trae datos frescos: refrescar encima cancela la navegación.
      if (!receiptId) router.replace(`/dashboard/treasury/receipts/${saved.id}`);
      else router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el recibo', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el recibo');
    },
  });

  const confirm = useMutation({
    mutationFn: async (v: ReceiptFormValues) => unwrapAction(await confirmReceipt(receiptId, v)),
    onSuccess: async (confirmed) => {
      setConfirming(false);
      await afterWrite(confirmed.withholdingIds);
      toast.success(`Recibo ${confirmed.number} confirmado`);
      if (receiptId) router.refresh();
      else router.push(`/dashboard/treasury/receipts/${confirmed.id}`);
    },
    onError: (error) => {
      setConfirming(false);
      logger.error('Error al confirmar el recibo', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo confirmar el recibo');
    },
  });

  const remove = useMutation({
    mutationFn: async () => unwrapAction(await deleteReceiptDraft(receiptId as string)),
    onSuccess: () => {
      toast.success('Borrador borrado');
      invalidateTreasury(queryClient);
      router.push('/dashboard/treasury?tab=cobranzas&view=receipts');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo borrar el borrador'),
  });

  const busy = save.isPending || confirm.isPending || remove.isPending;

  const askConfirm = async () => {
    if (await form.trigger()) setConfirming(true);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 pb-28">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente y fecha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_12rem] [&>*]:min-w-0">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    {/* El combo compartido no se achica por debajo de su texto: acá sí, para el ancho de un celular. */}
                    <div className="min-w-0 [&_[role=combobox]]:min-w-0">
                    <FormControl>
                      <SearchCombobox
                        queryKey={['treasury-receipt-customers']}
                        search={(query) => searchCollectionCustomers(query, true)}
                        value={field.value}
                        selectedLabel={customerLabel}
                        onSelect={changeCustomer}
                        placeholder="Elegí el cliente"
                        searchPlaceholder="Razón social o CUIT…"
                        noun="clientes"
                      />
                    </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha del cobro</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                        setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {values.rates.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {values.rates.map((r, i) => (
                  <FormField
                    key={r.currency}
                    control={form.control}
                    name={`rates.${i}.rate`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cotización del {r.currency} del cobro</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="1.250,00" className="text-right tabular-nums" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {customerId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qué se cobra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ReceiptInvoicesSection form={form} values={values} invoices={data?.openInvoices ?? []} preview={preview} loading={!data} />
              <Separator />
              <ReceiptAdvancesSection form={form} values={values} advances={data?.advances ?? []} />
            </CardContent>
          </Card>
        )}

        {customerId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retenciones que practicó el cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptWithholdingsSection
                form={form}
                rows={withholdingRows}
                files={initialData.receipt?.withholdingFiles ?? {}}
                certificates={certificates}
                onCertificate={(rowId, file) =>
                  setCertificates((current) => {
                    const next = { ...current };
                    if (file) next[rowId] = file;
                    else delete next[rowId];
                    return next;
                  })
                }
              />
            </CardContent>
          </Card>
        )}

        {customerId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Medios</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptPaymentsSection form={form} accounts={data?.accounts ?? initialData.accounts} gap={preview.gap} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-1 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-3">
            <ReceiptSummary preview={preview} empty={isEmpty} />
            <div className="ml-auto flex flex-wrap gap-2">
              {receiptId && canDelete && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(true)}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Borrar borrador
                </Button>
              )}
              <Button type="submit" variant="outline" size="sm" disabled={busy || !customerId}>
                <Save className="mr-1 h-4 w-4" />
                {save.isPending ? 'Guardando…' : 'Guardar borrador'}
              </Button>
              <Button type="button" size="sm" disabled={busy || !customerId || isEmpty || !preview.closes || preview.missingRates.length > 0} onClick={askConfirm}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      </form>

      <AlertDialog open={confirming} onOpenChange={(open) => !confirm.isPending && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar el recibo?</AlertDialogTitle>
            <AlertDialogDescription>
              Toma número, cancela {values.invoices.length === 1 ? 'el comprobante' : `${values.invoices.length} comprobantes`} y registra {values.payments.length === 1 ? 'el medio' : `${values.payments.length} medios`} en las cuentas. Un recibo confirmado no se edita: si hay un error, se anula.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ReceiptSummary preview={preview} detailed />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirm.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirm.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirm.mutate(form.getValues());
              }}
            >
              {confirm.isPending ? 'Confirmando…' : 'Confirmar recibo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting} onOpenChange={(open) => !remove.isPending && setDeleting(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el borrador?</AlertDialogTitle>
            <AlertDialogDescription>Libera los comprobantes y anticipos que reservaba y borra sus certificados. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              Borrar borrador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
