'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { parseSerialNumbers } from '@/features/Warehouses/schemas/stock-movement';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { type ReceiptFormData } from '../../actions/receipt-queries.server';
import { createPurchaseReceipt, uploadPurchaseReceiptAttachment } from '../../actions/receipts.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { trimDecimals } from '../../lib/quantity-format';
import { splitReceived } from '../../lib/receipt-math';
import {
  RECEIPT_ATTACHMENT_MAX_BYTES,
  RECEIPT_ATTACHMENT_TYPES,
  purchaseReceiptFormSchema,
} from '../../schemas/receipts';
import { invalidateWarehouseAfterReceipt } from '../lib/invalidate-warehouse';

const logger = new Logger('Purchases/PurchaseReceiptForm');

/** La recepcion + el remito escaneado (opcional; se sube despues de registrar). */
const formSchema = purchaseReceiptFormSchema.and(
  z.object({
    attachment: z
      .custom<File | null>((value) => value === null || value instanceof File)
      .refine((file) => !file || file.size <= RECEIPT_ATTACHMENT_MAX_BYTES, 'El archivo supera los 10 MB')
      .refine(
        (file) => !file || (RECEIPT_ATTACHMENT_TYPES as readonly string[]).includes(file.type),
        'Tiene que ser PDF o imagen'
      ),
  })
);

type FormValues = z.infer<typeof formSchema>;

type Line = ReceiptFormData['lines'][number];

/**
 * Registrar una recepcion contra la OC: cabecera (deposito si hay materiales, fecha, remito) y una
 * tarjeta por linea con lo que falta recibir. Lo que pase de eso se avisa en la fila: va a una OC
 * complementaria en borrador.
 */
export function PurchaseReceiptForm({ data }: { data: ReceiptFormData }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pending = data.lines.filter((line) => Number(line.remaining) > 0);
  const hasMaterials = data.lines.some((line) => line.isMaterial);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      orderId: data.order.id,
      warehouseId: data.warehouses.length === 1 ? data.warehouses[0]!.id : '',
      receivedOn: argentinaDate(),
      deliveryNote: '',
      notes: '',
      lines: data.lines.map((line) => ({
        orderLineId: line.orderLineId,
        quantity: Number(line.remaining) > 0 ? trimDecimals(line.remaining) : '',
        batchNumber: '',
        batchExpiresOn: '',
        serialNumbers: '',
      })),
      attachment: null,
    },
  });

  const save = useMutation({
    mutationFn: async ({ attachment, ...values }: FormValues) => {
      const created = unwrapAction(await createPurchaseReceipt(values));
      let attachError: string | null = null;
      if (attachment) {
        const body = new FormData();
        body.set('file', attachment);
        const uploaded = await uploadPurchaseReceiptAttachment(created.id, body);
        if (!uploaded.ok) attachError = uploaded.error;
      }
      return { ...created, attachError };
    },
    onSuccess: (created) => {
      const lines = form.getValues('lines').filter((line) => Number(line.quantity.replace(',', '.')) > 0).length;
      const stock = created.movementNumber ? `, entrada ${created.movementNumber} en ${created.warehouseName}` : '';
      toast.success(`${created.number}: ${lines} ${lines === 1 ? 'línea' : 'líneas'}${stock}`, {
        description: created.complementNumber
          ? `OC complementaria ${created.complementNumber} en borrador por el excedente.`
          : undefined,
      });
      if (created.attachError)
        toast.warning('La recepción quedó registrada, pero no se pudo subir el remito', {
          description: created.attachError,
        });
      invalidatePurchases(queryClient);
      invalidateWarehouseAfterReceipt(queryClient);
      router.push(`/dashboard/purchases/receipts/${created.id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al registrar la recepción', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la recepción');
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos de la recepción</CardTitle>
            <CardDescription>
              Orden{' '}
              <Link href={`/dashboard/purchases/orders/${data.order.id}`} className="font-mono underline">
                {data.order.number}
              </Link>{' '}
              de {data.order.supplier.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {hasMaterials && (
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Dónde entra el material" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {data.warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name} ({warehouse.code})
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
              name="receivedOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de recepción</FormLabel>
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
              name="deliveryNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de remito (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="0001-00001234" {...field} />
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
                  <FormLabel>Remito escaneado (opcional)</FormLabel>
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
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Observaciones (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Estado de la mercadería, quién recibió…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qué llegó</CardTitle>
            <CardDescription>
              Viene cargado lo que falta recibir de cada línea. Dejá en 0 lo que no llegó.
              {pending.length < data.lines.length && ' Las líneas ya recibidas completas también admiten excedente.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lines.map((line, index) => (
              <ReceiptLineFields key={line.orderLineId} form={form} index={index} line={line} />
            ))}
            {form.formState.errors.lines?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.lines.message}</p>
            )}
            {form.formState.errors.lines?.root?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.lines.root.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Registrando…' : 'Registrar recepción'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ReceiptLineFields({ form, index, line }: { form: UseFormReturn<FormValues>; index: number; line: Line }) {
  const values = useWatch({ control: form.control, name: `lines.${index}` });
  const quantity = values?.quantity ?? '';
  const { excess } = splitReceived({ remaining: line.remaining, received: quantity || '0' });
  const hasExcess = Number(excess) > 0;
  const serialCount = parseSerialNumbers(values?.serialNumbers ?? '').length;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {line.position}. {line.itemLabel}
        </span>
        <span className="text-muted-foreground tabular-nums">
          Pedido {formatQuantity(line.ordered)} {line.unitAbbr} · recibido {formatQuantity(line.received)} · falta{' '}
          {formatQuantity(line.remaining)} {line.unitAbbr}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        <Link href={`/dashboard/purchases/requests/${line.request.id}`} className="font-mono underline">
          {line.request.number}
        </Link>
        {line.destination ? ` · imputada a ${line.destination} (la salida la hace Almacenes)` : ' · para stock'}
        {!line.isMaterial && ' · servicio: no entra al stock'}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          control={form.control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cantidad recibida ({line.unitAbbr})</FormLabel>
              <FormControl>
                <Input inputMode="decimal" className="tabular-nums" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {line.trackingType === 'BATCH' && (
          <>
            <FormField
              control={form.control}
              name={`lines.${index}.batchNumber`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lote</FormLabel>
                  <FormControl>
                    <Input placeholder="L-0001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`lines.${index}.batchExpiresOn`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimiento del lote (opcional)</FormLabel>
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
          </>
        )}
        {line.trackingType === 'SERIAL' && (
          <FormField
            control={form.control}
            name={`lines.${index}.serialNumbers`}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Números de serie</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Uno por línea" {...field} />
                </FormControl>
                <FormDescription className="tabular-nums">
                  {serialCount} de {formatQuantity(quantity.replace(',', '.') || '0')} números de serie
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
      {hasExcess && (
        <Alert className="border-warn/35 bg-warn-subtle text-warn-subtle-foreground">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Se reciben {formatQuantity(excess)} {line.unitAbbr} de más: se va a crear una OC complementaria en borrador
            por el excedente.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
