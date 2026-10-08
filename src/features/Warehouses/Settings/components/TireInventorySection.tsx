'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tireStatusLabels, tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { registerInitialTireInventoryAction, type TiresWithoutStockGroup } from '../../actions/tire-inventory.server';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { tireInventorySchema, type TireInventoryFormValues } from '../../schemas/tire-inventory';

const logger = new Logger('Warehouses/TireInventorySection');

interface TireInventorySectionProps {
  groups: TiresWithoutStockGroup[];
  warehouses: { id: string; name: string }[];
}

/**
 * Inventario inicial de cubiertas (spec etapa 6 §3.5): las cubiertas de Gomeria que todavia no
 * tienen stock entran al deposito elegido con el costo de su tipo + marca; las montadas, en
 * reparacion o extraviadas salen al vehiculo donde estan (o del que salieron).
 */
export function TireInventorySection({ groups, warehouses }: TireInventorySectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<TireInventoryFormValues>({
    resolver: zodResolver(tireInventorySchema),
    defaultValues: {
      warehouseId: warehouses.length === 1 ? warehouses[0]!.id : '',
      costs: groups.map((g) => ({ tireTypeId: g.tireTypeId, brandId: g.brandId, unitCost: '' })),
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: TireInventoryFormValues) => unwrapAction(await registerInitialTireInventoryAction(values)),
    onSuccess: (result) => {
      const exits = result.exits.length ? ` y ${result.exits.length} salida(s) a los equipos (${result.exits.join(', ')})` : '';
      const kept =
        result.keptInWarehouse === 1
          ? '. Quedó en el depósito 1 cubierta sin equipo conocido'
          : result.keptInWarehouse > 1
            ? `. Quedaron en el depósito ${result.keptInWarehouse} cubiertas sin equipo conocido`
            : '';
      toast.success(`Inventario cargado: ${result.tires} cubiertas en ${result.entryNumber}${exits}${kept}`);
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
      void queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.movements });
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al cargar el inventario inicial de cubiertas', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el inventario');
    },
  });

  const total = groups.reduce((acc, g) => acc + g.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventario inicial de cubiertas</CardTitle>
        <CardDescription>
          Hay <span className="tabular-nums">{total}</span> cubiertas de Gomería sin stock. Al cargarlas entran al
          depósito con el costo de su tipo y marca; las montadas, en reparación o extraviadas quedan imputadas al equipo
          donde están.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Depósito</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí el depósito" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="divide-y rounded-md border">
              {groups.map((group, index) => (
                <div key={`${group.tireTypeId}|${group.brandId}`} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {group.size} {tireTreadTypeLabels[group.treadType] ?? group.treadType} · {group.brandName}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {group.total} cubiertas:{' '}
                      {Object.entries(group.byStatus)
                        .map(([status, count]) => `${count} ${(tireStatusLabels[status] ?? status).toLowerCase()}`)
                        .join(', ')}
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name={`costs.${index}.unitCost`}
                    render={({ field }) => (
                      <FormItem className="w-44">
                        <FormLabel className="sr-only">Costo unitario</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="Costo unitario ($)" className="tabular-nums" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Cargando…' : `Cargar ${total} cubiertas al stock`}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
