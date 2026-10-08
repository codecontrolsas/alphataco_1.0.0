'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { getMaterialAvailability, type MovementFormLookups } from '../../actions/options.server';
import { deliverRequestAction, type MaterialRequestDetail } from '../../actions/requests.server';
import { formatQuantity } from '../../lib/format';
import { REQUEST_STATUS_LABELS } from '../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { BatchOptions, UnitPicker } from '../../Movements/components/StockPickers';
import { deliverRequestSchema, type DeliverRequestFormValues } from '../../schemas/requests';

const logger = new Logger('Warehouses/DeliverRequestForm');

type PendingLine = MaterialRequestDetail['lines'][number];

/**
 * Entrega de un pedido aprobado: deposito, fecha y, por cada linea pendiente, cuanto se entrega
 * (por defecto, todo lo pendiente) con su lote o sus unidades. Lo que queda en 0 no se entrega
 * esta vez: el pedido sigue "entregado en parte".
 */
export function DeliverRequestForm({
  request,
  warehouses,
}: {
  request: MaterialRequestDetail;
  warehouses: MovementFormLookups['warehouses'];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pendingLines = request.lines.filter((l) => Number(l.pending) > 0);

  const form = useForm<DeliverRequestFormValues>({
    resolver: zodResolver(deliverRequestSchema),
    defaultValues: {
      requestId: request.id,
      warehouseId: warehouses.length === 1 ? warehouses[0]!.id : '',
      occurredOn: new Date(),
      notes: '',
      lines: pendingLines.map((l) => ({
        requestLineId: l.id,
        materialId: l.material.id,
        trackingType: l.material.trackingType,
        quantity: l.material.trackingType === 'SERIAL' ? '' : l.pending,
        batchId: '',
        unitIds: [],
      })),
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: DeliverRequestFormValues) => unwrapAction(await deliverRequestAction(values)),
    onSuccess: (result) => {
      toast.success(`${result.number}: entrega de ${request.number} registrada. Estado: ${REQUEST_STATUS_LABELS[result.status]}`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.movements });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.availability });
      router.push(`/dashboard/warehouse/requests/${request.id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al registrar la entrega', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la entrega');
    },
  });

  if (warehouses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay depósitos activos desde donde entregar.
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
            <CardDescription>
              Sale del depósito elegido y se imputa a {request.destination ?? 'el destino del pedido'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        // Lotes y unidades son del deposito anterior.
                        pendingLines.forEach((_, i) => {
                          form.setValue(`lines.${i}.batchId`, '');
                          form.setValue(`lines.${i}.unitIds`, []);
                        });
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí un depósito" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} ({w.code})
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
                name="occurredOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker date={field.value} setDate={field.onChange} placeholder="DD/MM/AAAA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Materiales pendientes</CardTitle>
            <CardDescription>Dejá en 0 lo que no se entrega ahora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingLines.map((line, index) => (
              <DeliveryLineRow key={line.id} form={form} index={index} line={line} />
            ))}
            {form.formState.errors.lines?.root?.message && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.root.message}</p>
            )}
            {form.formState.errors.lines?.message && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Registrando…' : 'Registrar entrega'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function DeliveryLineRow({
  form,
  index,
  line,
}: {
  form: UseFormReturn<DeliverRequestFormValues>;
  index: number;
  line: PendingLine;
}) {
  const warehouseId = useWatch({ control: form.control, name: 'warehouseId' });
  const unitIds = useWatch({ control: form.control, name: `lines.${index}.unitIds` });
  const tracking = line.material.trackingType;
  const unit = line.material.unit;
  const path = `lines.${index}` as const;

  const availability = useQuery({
    queryKey: [...WAREHOUSE_QUERY_KEYS.availability, line.material.id, warehouseId],
    queryFn: () => getMaterialAvailability(line.material.id, warehouseId),
    enabled: Boolean(warehouseId),
    staleTime: 15 * 1000,
  });
  const available = availability.data;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="font-mono text-xs text-muted-foreground">{line.material.code}</span> {line.material.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Pendiente {formatQuantity(line.pending)} {unit}
          {' · '}
          {!warehouseId
            ? 'elegí el depósito para ver el disponible'
            : availability.isLoading
              ? 'consultando disponible…'
              : `disponible ${formatQuantity(available?.total ?? '0')} ${unit}`}
        </p>
      </div>

      {tracking === 'SERIAL' ? (
        <FormField
          control={form.control}
          name={`${path}.unitIds`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Unidades <span className="tabular-nums text-muted-foreground">({unitIds.length} elegidas)</span>
              </FormLabel>
              {available?.units.length ? (
                <UnitPicker units={available.units} value={field.value} onChange={field.onChange} idPrefix={path} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {warehouseId ? 'No hay unidades de este material en el depósito.' : 'Elegí el depósito.'}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <FormField
            control={form.control}
            name={`${path}.quantity`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>A entregar</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input inputMode="decimal" className="tabular-nums" {...field} />
                  </FormControl>
                  <span className="w-10 shrink-0 text-sm text-muted-foreground">{unit}</span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          {tracking === 'BATCH' && (
            <FormField
              control={form.control}
              name={`${path}.batchId`}
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel>Lote</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!available?.batches.length}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={available?.batches.length ? 'Elegí el lote' : 'Sin lotes con stock en el depósito'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <BatchOptions batches={available?.batches ?? []} unit={unit} allowExpired={false} />
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}
