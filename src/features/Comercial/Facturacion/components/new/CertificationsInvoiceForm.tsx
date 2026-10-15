'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createInvoiceDraftFromCertifications } from '../../actions/invoice-drafts-create.server';
import { getInvoiceableCertifications } from '../../actions/invoices.server';
import { sumAmounts } from '../../lib/invoice-math';
import {
  CERTIFICATIONS_TAB_HREF,
  INVOICING_TAB_HREF,
  countLabel,
  formatCuitText,
  invoiceHref,
} from '../../utils/invoice-links';

const logger = new Logger('features/Comercial/Facturacion/new-from-certifications');

const schema = z.object({
  customerId: z.string().min(1, 'Elegí un cliente'),
  certificationIds: z.array(z.string()).min(1, 'Elegí al menos una certificación'),
});

type FormValues = z.infer<typeof schema>;

type Customer = { id: string; name: string; cuit: string; count: number };
type CertificationRow = Awaited<ReturnType<typeof getInvoiceableCertifications>>[number];

const LINK_CLASS =
  'font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function formatPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return '—';
  return `${moment.utc(from).format('DD/MM/YYYY')}–${moment.utc(to).format('DD/MM/YYYY')}`;
}

/**
 * Borrador desde certificaciones: cliente → certificaciones confirmadas sin facturar, agrupadas por
 * moneda → "Crear borrador". Una factura lleva una sola moneda: al tildar una certificación, las de
 * otras monedas quedan `aria-disabled` con el motivo escrito en la fila (no se ocultan).
 */
export function CertificationsInvoiceForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customerId: '', certificationIds: [] },
  });
  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const selectedIds = useWatch({ control: form.control, name: 'certificationIds' });

  const certificationsQuery = useQuery({
    queryKey: ['invoiceable-certifications', customerId],
    queryFn: () => getInvoiceableCertifications(customerId),
    enabled: customerId !== '',
    staleTime: 30 * 1000,
  });
  const certifications = useMemo(() => certificationsQuery.data ?? [], [certificationsQuery.data]);

  const groups = useMemo(() => {
    const byCurrency = new Map<string, CertificationRow[]>();
    for (const cert of certifications) {
      byCurrency.set(cert.currency, [...(byCurrency.get(cert.currency) ?? []), cert]);
    }
    return [...byCurrency.entries()].map(([currency, rows]) => ({
      currency,
      rows,
      subtotal: rows.every((r) => r.total !== null) ? sumAmounts(rows.map((r) => r.total ?? '0')) : null,
    }));
  }, [certifications]);

  const selected = certifications.filter((c) => selectedIds.includes(c.id));
  const selectedCurrency = selected[0]?.currency ?? null;
  const selectedTotal =
    selected.length > 0 && selected.every((c) => c.total !== null)
      ? sumAmounts(selected.map((c) => c.total ?? '0'))
      : null;
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const handleCustomerChange = (values: string[]) => {
    const next = values[0] ?? '';
    form.setValue('customerId', next, { shouldValidate: form.formState.isSubmitted });
    // Las certificaciones elegidas son del cliente anterior: se descartan.
    form.setValue('certificationIds', []);
    setServerError(null);
  };

  const toggleCertification = (cert: CertificationRow, checked: boolean) => {
    if (checked && selectedCurrency && cert.currency !== selectedCurrency) return;
    const next = checked ? [...selectedIds, cert.id] : selectedIds.filter((id) => id !== cert.id);
    form.setValue('certificationIds', next, { shouldValidate: form.formState.isSubmitted });
    setServerError(null);
  };

  const onSubmit = (values: FormValues) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoiceDraftFromCertifications(values.certificationIds);
      if (!result.ok) {
        logger.warn('No se creó el borrador desde certificaciones', { data: { error: result.error } });
        setServerError(result.error);
        // Puede que otra persona haya tomado alguna: se vuelve a leer la lista.
        void certificationsQuery.refetch();
        return;
      }
      toast.success(
        `Borrador creado con ${countLabel(values.certificationIds.length, 'certificación', 'certificaciones')}.`
      );
      router.push(invoiceHref(result.data.id));
    });
  };

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border px-6 py-8">
        <p className="font-medium">No hay certificaciones confirmadas para facturar.</p>
        <p className="text-muted-foreground text-sm text-pretty">
          Las certificaciones se confirman en Comercial → Certificaciones. Cuando haya alguna confirmada sin facturar,
          aparece acá.
        </p>
        <Button asChild variant="outline">
          <Link href={CERTIFICATIONS_TAB_HREF}>Ir a Certificaciones</Link>
        </Button>
      </div>
    );
  }

  const statusText =
    selected.length === 0
      ? customerId
        ? 'Tildá las certificaciones que van en la factura.'
        : 'Elegí un cliente para ver sus certificaciones.'
      : `${countLabel(selected.length, 'certificación seleccionada', 'certificaciones seleccionadas')}`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6 [scroll-padding-bottom:6rem]">
        <FormField
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <FormItem className="max-w-xl">
              <FormLabel>Cliente</FormLabel>
              <FormControl>
                <MultiSelectCombobox
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} · ${countLabel(c.count, 'certificación', 'certificaciones')}`,
                  }))}
                  placeholder="Elegí un cliente"
                  emptyMessage="Ningún cliente coincide con la búsqueda."
                  selectedValues={field.value ? [field.value] : []}
                  onChange={handleCustomerChange}
                  maxSelections={1}
                  closeOnSelect
                  searchPlaceholder="Buscar cliente..."
                  disabled={pending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {customerId !== '' && (
          <section aria-labelledby="certifications-heading" className="flex flex-col gap-4">
            <div>
              <h2 id="certifications-heading" className="text-lg font-semibold">
                Certificaciones de {customer?.name}
              </h2>
              {customer && (
                <p className="text-muted-foreground text-sm tabular-nums">CUIT {formatCuitText(customer.cuit)}</p>
              )}
            </div>

            {certificationsQuery.isPending ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <p className="text-muted-foreground text-sm">Cargando certificaciones de {customer?.name}…</p>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : certificationsQuery.isError ? (
              <div
                role="alert"
                className="border-destructive/40 text-destructive flex flex-col items-start gap-3 border px-4 py-3 text-sm"
              >
                <p>No se pudieron cargar las certificaciones. Revisá la conexión y probá de nuevo.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void certificationsQuery.refetch()}>
                  <RefreshCw aria-hidden />
                  Reintentar
                </Button>
              </div>
            ) : certifications.length === 0 ? (
              <div className="flex flex-col items-start gap-2 border px-6 py-6">
                <p className="font-medium">Este cliente no tiene certificaciones confirmadas sin facturar.</p>
                <p className="text-muted-foreground text-sm">
                  Puede que otra factura las haya tomado.{' '}
                  <Link href={CERTIFICATIONS_TAB_HREF} className={LINK_CLASS}>
                    Ver Certificaciones
                  </Link>
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="certificationIds"
                render={() => (
                  <FormItem className="flex flex-col gap-6">
                    {groups.map((group) => {
                      const otherCurrency = selectedCurrency !== null && group.currency !== selectedCurrency;
                      return (
                        <fieldset key={group.currency} className="flex min-w-0 flex-col gap-2">
                          <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold">{group.currency}</span>
                            <span className="text-muted-foreground text-sm whitespace-nowrap">
                              {countLabel(group.rows.length, 'certificación', 'certificaciones')} ·{' '}
                              <CertificationAmount value={group.subtotal} currency={group.currency} />
                            </span>
                          </legend>
                          {otherCurrency && (
                            <p className="text-muted-foreground text-sm">Otra moneda: se factura aparte.</p>
                          )}
                          <ul className="divide-y border">
                            {group.rows.map((cert) => {
                              const checked = selectedIds.includes(cert.id);
                              const checkboxId = `cert-${cert.id}`;
                              const reasonId = `cert-${cert.id}-reason`;
                              return (
                                <li
                                  key={cert.id}
                                  className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                                >
                                  <Checkbox
                                    id={checkboxId}
                                    checked={checked}
                                    aria-disabled={otherCurrency || pending}
                                    aria-describedby={otherCurrency ? reasonId : undefined}
                                    className="mt-0.5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                                    onCheckedChange={(value) => {
                                      if (otherCurrency || pending) return;
                                      toggleCertification(cert, value === true);
                                    }}
                                  />
                                  <label htmlFor={checkboxId} className="flex min-w-0 cursor-pointer flex-col gap-0.5">
                                    <span className="font-medium tabular-nums">{cert.number}</span>
                                    <span
                                      className="text-muted-foreground truncate text-sm"
                                      title={cert.contract ?? undefined}
                                    >
                                      {cert.contract ?? 'Sin contrato'}
                                      {cert.contractNumber ? ` · N° ${cert.contractNumber}` : ''}
                                    </span>
                                    <span className="text-muted-foreground text-sm tabular-nums">
                                      Período {formatPeriod(cert.periodFrom, cert.periodTo)}
                                    </span>
                                    {otherCurrency && (
                                      <span id={reasonId} className="text-muted-foreground text-xs">
                                        Otra moneda: se factura aparte
                                      </span>
                                    )}
                                  </label>
                                  <span className="col-start-2 text-sm font-medium whitespace-nowrap sm:col-start-3 sm:text-right">
                                    <CertificationAmount value={cert.total} currency={cert.currency} />
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </fieldset>
                      );
                    })}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </section>
        )}

        {/* Barra de selección: fuera de las listas (que pueden crecer) y siempre montada, para que
            el lector de pantalla anuncie los cambios de la región `status`. */}
        <div className="bg-background sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t px-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {serverError && (
            <p role="alert" className="text-destructive text-sm text-pretty">
              {serverError}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-sm tabular-nums">
              {statusText}
              {selectedTotal && selectedCurrency && (
                <>
                  {' · '}
                  <span className="font-semibold whitespace-nowrap">
                    <CertificationAmount value={selectedTotal} currency={selectedCurrency} />
                  </span>
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={INVOICING_TAB_HREF}>Cancelar</Link>
              </Button>
              <Button type="submit" variant="brand" disabled={pending}>
                <LoadingSwap isLoading={pending}>Crear borrador</LoadingSwap>
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
