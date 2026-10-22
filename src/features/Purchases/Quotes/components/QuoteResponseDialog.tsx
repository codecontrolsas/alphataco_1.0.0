'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { Logger } from '@/lib/logger';
import { DEFAULT_VAT_RATE_ID, VAT_RATES, VAT_RATE_LABELS } from '@/shared/lib/arca/catalogs';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { recordPurchaseQuoteResponse, uploadPurchaseQuoteAttachment } from '../../actions/quotes.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { trimDecimals } from '../../lib/quantity-format';
import type { PurchaseQuoteDetail } from '../../lib/quote-query-types';
import { QUOTE_ATTACHMENT_MAX_BYTES, QUOTE_ATTACHMENT_TYPES, quoteResponseSchema } from '../../schemas/quotes';

const logger = new Logger('Purchases/QuoteResponseDialog');

const VAT_RATE_IDS = Object.keys(VAT_RATES).map(Number) as (keyof typeof VAT_RATES)[];

/** La respuesta + el presupuesto adjunto (opcional; se sube despues de guardar la respuesta). */
const dialogSchema = quoteResponseSchema.and(
  z.object({
    attachment: z
      .custom<File | null>((value) => value === null || value instanceof File)
      .refine((file) => !file || file.size <= QUOTE_ATTACHMENT_MAX_BYTES, 'El archivo supera los 10 MB')
      .refine(
        (file) => !file || (QUOTE_ATTACHMENT_TYPES as readonly string[]).includes(file.type),
        'Tiene que ser PDF o imagen'
      ),
  })
);

type DialogValues = z.infer<typeof dialogSchema>;

function defaults(quote: PurchaseQuoteDetail): DialogValues {
  return {
    receivedAt: quote.receivedAt ?? argentinaDate(),
    validUntil: quote.validUntil ?? '',
    deliveryDays: quote.deliveryDays === null ? '' : String(quote.deliveryDays),
    supplierNotes: quote.supplierNotes ?? '',
    lines: quote.lines.map((line) => ({
      lineId: line.id,
      notQuoted: line.notQuoted,
      unitPrice: line.unitPrice ? trimDecimals(line.unitPrice) : '',
      vatRateId: line.vatRateId ?? DEFAULT_VAT_RATE_ID,
    })),
    attachment: null,
  };
}

/**
 * Carga (o corrige) la respuesta del proveedor: precio neto y alicuota por linea, o "no cotiza";
 * fecha, validez, plazo de entrega, notas y el presupuesto adjunto.
 */
export function QuoteResponseDialog({ quote }: { quote: PurchaseQuoteDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<DialogValues>({ resolver: zodResolver(dialogSchema), defaultValues: defaults(quote) });
  const lines = useWatch({ control: form.control, name: 'lines' });

  const mutation = useMutation({
    mutationFn: async ({ attachment, ...values }: DialogValues) => {
      unwrapAction(await recordPurchaseQuoteResponse(quote.id, values));
      if (!attachment) return { attached: null };
      const data = new FormData();
      data.set('file', attachment);
      const uploaded = await uploadPurchaseQuoteAttachment(quote.id, data);
      return { attached: uploaded.ok ? true : uploaded.error };
    },
    onSuccess: ({ attached }) => {
      if (typeof attached === 'string') {
        toast.warning('La respuesta quedó guardada, pero no se pudo subir el presupuesto', { description: attached });
      } else {
        toast.success(`Respuesta de ${quote.supplier.name} guardada`);
      }
      setOpen(false);
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la respuesta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la respuesta');
    },
  });

  const dateField = (name: 'receivedAt' | 'validUntil', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
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
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults(quote));
      }}
    >
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <ClipboardCheck className="mr-1 h-4 w-4" />
        {quote.status === 'RECEIVED' ? 'Corregir respuesta' : 'Cargar respuesta'}
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Respuesta de {quote.supplier.name}</DialogTitle>
          <DialogDescription>
            Precio unitario neto y alícuota de IVA de cada ítem, o marcá los que no cotiza.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <div className="space-y-3">
              {quote.lines.map((line, index) => {
                const notQuoted = lines?.[index]?.notQuoted ?? false;
                return (
                  <div
                    key={line.id}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto] sm:items-end"
                  >
                    <div className="text-sm">
                      <div>{line.itemLabel}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatQuantity(line.quantity)} {line.unitAbbr} · {line.request.number}
                      </div>
                    </div>
                    <FormField
                      control={form.control}
                      name={`lines.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Unitario neto</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="decimal"
                              className="tabular-nums"
                              placeholder="0,00"
                              disabled={notQuoted}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.vatRateId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">IVA</FormLabel>
                          <Select
                            value={String(field.value ?? DEFAULT_VAT_RATE_ID)}
                            onValueChange={(v) => field.onChange(Number(v))}
                            disabled={notQuoted}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {VAT_RATE_IDS.map((id) => (
                                <SelectItem key={id} value={String(id)}>
                                  {VAT_RATE_LABELS[id]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`lines.${index}.notQuoted`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0 pb-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">No cotiza</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
              {form.formState.errors.lines?.root?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.lines.root.message}</p>
              )}
              {form.formState.errors.lines?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.lines.message}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {dateField('receivedAt', 'Fecha de la respuesta')}
              {dateField('validUntil', 'Válida hasta (opcional)')}
              <FormField
                control={form.control}
                name="deliveryDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plazo de entrega (días)</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" className="tabular-nums" placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="supplierNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas del proveedor (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Condiciones, marca ofrecida, forma de pago…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="attachment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Presupuesto del proveedor (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                    />
                  </FormControl>
                  <FormDescription>
                    {quote.attachment
                      ? `Ya tiene uno (${quote.attachment.name}); si subís otro, lo reemplaza.`
                      : 'PDF o imagen, hasta 10 MB.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando…' : 'Guardar respuesta'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
