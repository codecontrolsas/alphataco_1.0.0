'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyPriceRevision, getPriceRevisions } from '../../actions/price-revisions.server';
import { PRICE_METHOD_LABELS } from '../../lib/price-method-labels';

const logger = new Logger('features/Empresa/Clientes/PriceRevisionsDialog');

/**
 * `price` es texto en todo el camino a propósito: pasarlo por `number` le come decimales a una
 * columna `Decimal(15,4)`. El servidor lo convierte a `Decimal` recién al escribirlo.
 */
const revisionFormSchema = z.object({
  price: z
    .string()
    .min(1, 'El precio es requerido')
    .refine((v) => /^\d+([.,]\d{1,4})?$/.test(v.trim()), 'Hasta 4 decimales, sin separador de miles'),
  validFrom: z.date({ message: 'La fecha de vigencia es requerida' }),
  reason: z.string().optional(),
});

type RevisionFormValues = z.infer<typeof revisionFormSchema>;

interface PriceRevisionsDialogProps {
  serviceItemId: string;
  itemName: string;
  /** Precio vigente según el ítem. Es el mismo que la revisión marcada vigente. */
  currentPrice: string | null;
  canUpdatePrices: boolean;
  /** Para refrescar la tabla de ítems: el precio vigente se muestra ahí. */
  onSaved?: () => void;
}

function formatPrice(value: number | string | null): string {
  // Sin `view_prices` el servidor no envía importes.
  if (value === null) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

/**
 * Historial de precios de un ítem de contrato y carga de una revisión manual.
 *
 * El precio que se usa para certificar es el de la revisión **vigente**, y ese valor queda
 * congelado en la certificación al emitirla: una revisión posterior no reescribe lo ya emitido.
 * Por eso el historial importa — es lo que explica de dónde salió cada monto certificado.
 */
export function PriceRevisionsDialog({
  serviceItemId,
  itemName,
  currentPrice,
  canUpdatePrices,
  onSaved,
}: PriceRevisionsDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: revisions = [], isPending } = useQuery({
    queryKey: ['price-revisions', serviceItemId],
    queryFn: () => getPriceRevisions(serviceItemId),
    // Sin esto la consulta sale en cada render de la tabla, para todos los ítems a la vez.
    enabled: open,
  });

  const form = useForm<RevisionFormValues>({
    resolver: zodResolver(revisionFormSchema),
    defaultValues: { price: '', validFrom: new Date(), reason: '' },
  });

  const onSubmit = async (values: RevisionFormValues) => {
    try {
      const result = await applyPriceRevision({
        serviceItemId,
        price: values.price.trim().replace(',', '.'),
        validFrom: moment(values.validFrom).format('YYYY-MM-DD'),
        reason: values.reason,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Precio actualizado. La revisión anterior queda en el historial.');
      form.reset({ price: '', validFrom: new Date(), reason: '' });
      queryClient.invalidateQueries({ queryKey: ['price-revisions', serviceItemId] });
      queryClient.invalidateQueries({ queryKey: ['service-items'] });
      queryClient.invalidateQueries({ queryKey: ['comercial', 'customer'] });
      onSaved?.();
    } catch (error) {
      // La action puede rechazar (no devolver `ok: false`): sin este catch el usuario no ve nada.
      logger.error('Error al actualizar el precio', { data: { error, serviceItemId } });
      toast.error('Error al actualizar el precio');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="link" className="hover:text-blue-400">
          <History className="h-3.5 w-3.5" />
          Precios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Precios de {itemName}</DialogTitle>
          <DialogDescription>
            El precio vigente es el que se usa al emitir una certificación. Una vez emitida, el valor queda fijado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground text-sm">Vigente</span>
          <span className="text-2xl font-semibold tabular-nums">{formatPrice(currentPrice)}</span>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-medium">Historial</p>
          {isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : revisions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Este ítem todavía no tiene revisiones de precio.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Anterior</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => (
                  <TableRow key={revision.id}>
                    <TableCell className="whitespace-nowrap">
                      {moment.utc(revision.valid_from).format('DD/MM/YYYY')}
                      {revision.is_current && (
                        <Badge variant="success" className="ml-2">
                          Vigente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatPrice(revision.price)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {revision.previous_price ? formatPrice(revision.previous_price) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {PRICE_METHOD_LABELS[revision.source]}
                      {revision.run?.rule?.name && (
                        <span className="text-muted-foreground ml-1 text-xs">({revision.run.rule.name})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{revision.change_reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {canUpdatePrices && (
          <>
            <Separator />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <p className="text-sm font-medium">Nuevo precio</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="0.0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="validFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vigente desde</FormLabel>
                        <FormControl>
                          <EnhancedDatePicker date={field.value} setDate={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo (opcional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Ej: acuerdo de actualización de abril" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Guardando...' : 'Aplicar precio'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
