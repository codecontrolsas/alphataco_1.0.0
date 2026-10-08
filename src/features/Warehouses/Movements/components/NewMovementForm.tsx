'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { registerStockMovementAction } from '../../actions/movements.server';
import type { MovementFormLookups } from '../../actions/options.server';
import { formatMoney } from '../../lib/format';
import { MOVEMENT_TYPE_LABELS } from '../../lib/labels';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import {
  emptyStockMovementLine,
  stockMovementSchema,
  type StockMovementFormValues,
  type StockMovementTypeValue,
} from '../../schemas/stock-movement';
import { DestinationFields } from './DestinationFields';
import { MovementLineRow } from './MovementLineRow';

const logger = new Logger('Warehouses/NewMovementForm');

const TYPE_HELP: Record<StockMovementTypeValue, string> = {
  ENTRY: 'Ingreso de material al depósito, con su costo (remito, compra, devolución de un proveedor).',
  EXIT: 'Entrega de material imputada a un empleado, equipo, orden de mantenimiento o cliente.',
  TRANSFER: 'Mover material de un depósito a otro. No cambia el stock total ni su costo.',
  ADJUSTMENT: 'Corregir el stock contra el conteo físico (faltantes, sobrantes, roturas). El motivo es obligatorio.',
};

interface NewMovementFormProps {
  lookups: MovementFormLookups;
  /** Tipos que el usuario puede registrar: `create` habilita entrada/salida/transferencia, `adjust` el ajuste. */
  allowedTypes: StockMovementTypeValue[];
  /** Sin salida directa una salida va por pedido de materiales (spec etapa 3 §3.4). */
  canDirectExit: boolean;
  canRequest: boolean;
}

export function NewMovementForm({ lookups, allowedTypes, canDirectExit, canRequest }: NewMovementFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<StockMovementFormValues>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      type: allowedTypes[0] ?? 'ENTRY',
      warehouseId: lookups.warehouses.length === 1 ? lookups.warehouses[0]!.id : '',
      targetWarehouseId: '',
      occurredOn: new Date(),
      reference: '',
      notes: '',
      destinationType: '',
      employeeId: '',
      vehicleId: '',
      otherEquipmentId: '',
      maintenanceOrderId: '',
      customerId: '',
      customerServiceId: '',
      lines: [emptyStockMovementLine()],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const [type, warehouseId] = useWatch({ control: form.control, name: ['type', 'warehouseId'] });
  const exitBlocked = type === 'EXIT' && !canDirectExit;

  const mutation = useMutation({
    mutationFn: async (values: StockMovementFormValues) => unwrapAction(await registerStockMovementAction(values)),
    onSuccess: (result) => {
      const lineText = result.lineCount === 1 ? '1 línea' : `${result.lineCount} líneas`;
      const total = result.totalCost !== null ? `, ${formatMoney(result.totalCost)}` : '';
      toast.success(`${result.number} registrado: ${lineText}${total}`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.movements });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.availability });
      router.push(`/dashboard/warehouse/movements/${result.id}`);
    },
    onError: (error) => {
      logger.error('Error al registrar el movimiento', { data: { error } });
      // El form NO se resetea: el usuario corrige y vuelve a enviar.
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el movimiento');
    },
  });

  if (lookups.warehouses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay depósitos activos. Creá uno en Almacenes → Depósitos antes de registrar movimientos.
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Movimiento</CardTitle>
            <CardDescription>{TYPE_HELP[type]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      // ToggleGroup permite "deseleccionar": se ignora para que siempre haya un tipo.
                      onValueChange={(v) => v && field.onChange(v)}
                      className="flex-wrap justify-start"
                    >
                      {allowedTypes.map((t) => (
                        <ToggleGroupItem key={t} value={t} className="px-4">
                          {MOVEMENT_TYPE_LABELS[t]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'TRANSFER' ? 'Depósito origen' : 'Depósito'}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí un depósito" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lookups.warehouses.map((w) => (
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
              {type === 'TRANSFER' && (
                <FormField
                  control={form.control}
                  name="targetWarehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depósito destino</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Elegí el destino" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {lookups.warehouses
                            .filter((w) => w.id !== warehouseId)
                            .map((w) => (
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
              )}
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
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia</FormLabel>
                    <FormControl>
                      <Input placeholder="Remito, factura… (opcional)" {...field} />
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
                  <FormLabel>{type === 'ADJUSTMENT' ? 'Motivo del ajuste' : 'Observaciones'}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={type === 'ADJUSTMENT' ? 'Ej.: conteo físico del 30/09, 2 bidones rotos' : 'Opcional'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {exitBlocked && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  No tenés permiso de salida directa: las salidas van por pedido de materiales, que aprueba un responsable.{' '}
                  {canRequest && (
                    <Link href="/dashboard/warehouse/requests/new" className="font-medium underline">
                      Hacer un pedido
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {type === 'EXIT' && !exitBlocked && (
              <>
                <Separator />
                <DestinationFields form={form} customers={lookups.customers} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Materiales</CardTitle>
              <CardDescription className="tabular-nums">
                {lines.fields.length === 1 ? '1 línea' : `${lines.fields.length} líneas`}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => lines.append(emptyStockMovementLine())}>
              <Plus className="mr-1 h-4 w-4" />
              Agregar línea
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.fields.map((field, index) => (
              <MovementLineRow
                key={field.id}
                form={form}
                index={index}
                canRemove={lines.fields.length > 1}
                onRemove={() => lines.remove(index)}
              />
            ))}
            {form.formState.errors.lines?.root?.message && (
              <p className="text-sm font-medium text-destructive">{form.formState.errors.lines.root.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending || exitBlocked}>
            {mutation.isPending ? 'Registrando…' : `Registrar ${MOVEMENT_TYPE_LABELS[type].toLowerCase()}`}
          </Button>
        </div>
      </form>
    </Form>
  );
}
