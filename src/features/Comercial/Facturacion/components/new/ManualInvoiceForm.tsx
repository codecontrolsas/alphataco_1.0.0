'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { ARCA_CURRENCY_BY_ISO, type SupportedCurrency } from '@/shared/lib/arca/catalogs';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { createManualInvoiceDraft } from '../../actions/invoice-drafts-create.server';
import { manualInvoiceSchema, type ManualInvoiceInput } from '../../schemas/invoice';
import { INVOICING_TAB_HREF, customerHref, invoiceHref } from '../../utils/invoice-links';

const logger = new Logger('features/Comercial/Facturacion/new-manual');

const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  ARS: 'ARS · Peso argentino',
  USD: 'USD · Dólar estadounidense',
  EUR: 'EUR · Euro',
};

const CURRENCIES = Object.keys(ARCA_CURRENCY_BY_ISO) as SupportedCurrency[];

type Customer = { id: string; name: string; cuit: string; hasFiscalData: boolean };

const LINK_CLASS =
  'inline-flex items-center gap-1 font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Borrador manual: cliente + moneda (ARS por defecto). Las líneas se cargan en el editor. */
export function ManualInvoiceForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ManualInvoiceInput>({
    resolver: zodResolver(manualInvoiceSchema),
    defaultValues: { customerId: '', currency: 'ARS' },
  });
  const customerId = useWatch({ control: form.control, name: 'customerId' });
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const missingFiscalData = customer !== null && !customer.hasFiscalData;

  const onSubmit = (values: ManualInvoiceInput) => {
    setServerError(null);
    if (missingFiscalData && customer) {
      form.setError('customerId', {
        message: `${customer.name} no tiene cargada la condición frente al IVA. Completala en la ficha del cliente.`,
      });
      return;
    }
    startTransition(async () => {
      const result = await createManualInvoiceDraft(values);
      if (!result.ok) {
        logger.warn('No se creó el borrador manual', { data: { error: result.error } });
        setServerError(result.error);
        return;
      }
      toast.success(`Borrador creado para ${customer?.name ?? 'el cliente'} en ${values.currency}.`);
      router.push(invoiceHref(result.data.id));
    });
  };

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 border px-6 py-8">
        <p className="font-medium">No hay clientes activos.</p>
        <p className="text-muted-foreground text-sm">
          Dá de alta un cliente en Comercial → Clientes para poder facturarle.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-6">
        <FormField
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <FormControl>
                <MultiSelectCombobox
                  options={customers.map((c) => ({ value: c.id, label: `${c.name} · CUIT ${formatCuitText(c.cuit)}` }))}
                  placeholder="Elegí un cliente"
                  emptyMessage="Ningún cliente coincide con la búsqueda."
                  selectedValues={field.value ? [field.value] : []}
                  onChange={(values) => {
                    field.onChange(values[0] ?? '');
                    form.clearErrors('customerId');
                    setServerError(null);
                  }}
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

        {missingFiscalData && customer && (
          <div
            role="note"
            className="flex items-start gap-3 border border-warn/35 bg-warn-subtle px-4 py-3 text-sm text-warn-subtle-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-pretty">
              A {customer.name} le falta la condición frente al IVA. Sin ese dato no se puede saber qué tipo de factura
              corresponde.{' '}
              <Link href={customerHref(customer.id)} target="_blank" rel="noopener" className={LINK_CLASS}>
                Completar en la ficha del cliente
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </Link>
            </p>
          </div>
        )}

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Moneda</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectGroup>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {CURRENCY_LABELS[currency]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                En moneda extranjera, la cotización la informa ARCA al emitir y queda fija en el comprobante.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError && (
          <p role="alert" className="text-destructive text-sm text-pretty">
            {serverError}
          </p>
        )}

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={INVOICING_TAB_HREF}>Cancelar</Link>
          </Button>
          <Button type="submit" variant="brand" disabled={pending}>
            <LoadingSwap isLoading={pending}>Crear borrador</LoadingSwap>
          </Button>
        </div>
      </form>
    </Form>
  );
}
