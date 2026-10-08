'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { MovementFormLookups, MaterialOption } from '../../actions/options.server';
import { searchMaterialOptions } from '../../actions/options.server';
import { createMaterialRequestAction, getRequestEstimateCosts } from '../../actions/requests.server';
import { SearchCombobox } from '../../components/SearchCombobox';
import { formatMoney } from '../../lib/format';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { DestinationFields } from '../../Movements/components/DestinationFields';
import { materialRequestSchema, type MaterialRequestFormValues } from '../../schemas/requests';
import { normalizeDecimal } from '../../schemas/stock-movement';

const logger = new Logger('Warehouses/NewRequestForm');

const emptyLine = () => ({ materialId: '', quantity: '' });

/** Pedido de materiales: a quien se imputa, que materiales y cuanto. Lote y serie los elige quien entrega. */
export function NewRequestForm({ customers, canViewPrices }: { customers: MovementFormLookups['customers']; canViewPrices: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [materials, setMaterials] = useState<Record<string, MaterialOption>>({});

  const form = useForm<MaterialRequestFormValues>({
    resolver: zodResolver(materialRequestSchema),
    defaultValues: {
      destinationType: '',
      employeeId: '',
      vehicleId: '',
      otherEquipmentId: '',
      maintenanceOrderId: '',
      customerId: '',
      customerServiceId: '',
      notes: '',
      lines: [emptyLine()],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watchedLines = useWatch({ control: form.control, name: 'lines' });

  const materialIds = [...new Set(watchedLines.map((l) => l.materialId).filter(Boolean))].sort();
  const costs = useQuery({
    queryKey: [...WAREHOUSE_QUERY_KEYS.requests, 'estimate', materialIds],
    queryFn: () => getRequestEstimateCosts(materialIds),
    enabled: canViewPrices && materialIds.length > 0,
    staleTime: 60 * 1000,
  });
  const estimate = costs.data
    ? watchedLines.reduce((acc, l) => {
        const quantity = Number(normalizeDecimal(l.quantity || '0'));
        const cost = Number(costs.data?.[l.materialId] ?? 0);
        return Number.isFinite(quantity) ? acc + quantity * cost : acc;
      }, 0)
    : null;

  const mutation = useMutation({
    mutationFn: async (values: MaterialRequestFormValues) => unwrapAction(await createMaterialRequestAction(values)),
    onSuccess: (result) => {
      toast.success(`${result.number} creado: queda pendiente de aprobación`);
      queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.requests });
      router.push(`/dashboard/warehouse/requests/${result.id}`);
    },
    onError: (error) => {
      logger.error('Error al crear el pedido', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el pedido');
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Pedido</CardTitle>
            <CardDescription>
              Lo aprueba un responsable y después el almacén lo entrega, en una o varias veces.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DestinationFields form={form} customers={customers} />
            <Separator />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Para qué se necesita, urgencia… (opcional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Materiales</CardTitle>
              <CardDescription className="tabular-nums">
                {lines.fields.length === 1 ? '1 línea' : `${lines.fields.length} líneas`}
                {estimate !== null && ` · total estimado ${formatMoney(estimate.toFixed(2))}`}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => lines.append(emptyLine())}>
              <Plus className="mr-1 h-4 w-4" />
              Agregar línea
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.fields.map((field, index) => (
              <RequestLineRow
                key={field.id}
                form={form}
                index={index}
                material={materials[field.id] ?? null}
                onMaterial={(option) => setMaterials((prev) => ({ ...prev, [field.id]: option! }))}
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enviando…' : 'Enviar pedido'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function RequestLineRow({
  form,
  index,
  material,
  onMaterial,
  canRemove,
  onRemove,
}: {
  form: UseFormReturn<MaterialRequestFormValues>;
  index: number;
  material: MaterialOption | null;
  onMaterial: (option: MaterialOption | null) => void;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <span className="mt-2 w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)]">
        <FormField
          control={form.control}
          name={`lines.${index}.materialId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Material</FormLabel>
              <SearchCombobox<MaterialOption>
                queryKey={WAREHOUSE_QUERY_KEYS.materialOptions}
                search={searchMaterialOptions}
                value={field.value}
                selectedLabel={material ? `${material.code} · ${material.name}` : null}
                onSelect={(option) => {
                  onMaterial(option);
                  field.onChange(option?.id ?? '');
                }}
                placeholder="Elegí un material"
                searchPlaceholder="Buscar por código o nombre"
                noun="materiales"
                renderOption={(option) => (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{option.code}</span>
                    <span className="truncate">{option.name}</span>
                  </span>
                )}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Cantidad</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input inputMode="decimal" placeholder="Cantidad" className="tabular-nums" {...field} />
                </FormControl>
                <span className="w-10 shrink-0 text-sm text-muted-foreground">{material?.unit ?? ''}</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={`Quitar línea ${index + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
