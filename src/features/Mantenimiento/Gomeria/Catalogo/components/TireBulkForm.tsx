'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { tireRetreadLabels, tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { getTireTypesForSelect } from '@/features/Mantenimiento/Gomeria/Tipos/actions/actions.server';
import { TireRetreadLevel } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { DECIMAL_RE } from '@/features/Warehouses/schemas/stock-movement';
import { createTiresBulk, getTireBrandsForSelect, getTireWarehousesForSelect } from '../actions/actions.server';

const logger = new Logger('TireBulkForm');

// ============================================================================
// SCHEMA
// ============================================================================

const tireBulkFormSchema = z
  .object({
    prefix: z.string().min(1, 'El prefijo es requerido'),
    rangeFrom: z.coerce.number().int('Debe ser un número entero').positive('Debe ser positivo'),
    rangeTo: z.coerce.number().int('Debe ser un número entero').positive('Debe ser positivo'),
    brand_id: z.string().uuid('Seleccione una marca válida'),
    tire_type_id: z.string().uuid('Seleccione un tipo de cubierta'),
    is_new: z.boolean().default(true),
    retread_level: z.nativeEnum(TireRetreadLevel).nullable().optional(),
    tread_depth: z.coerce.number().positive('Debe ser positivo').nullable().optional(),
    /** Las cubiertas entran al stock con una entrada (Almacenes etapa 6). */
    warehouseId: z.string(),
    unitCost: z.string().trim().regex(DECIMAL_RE, 'Costo inválido (hasta 4 decimales)'),
  })
  .refine((data) => data.rangeTo >= data.rangeFrom, {
    message: 'El número final debe ser mayor o igual al número inicial',
    path: ['rangeTo'],
  })
  .refine((data) => data.rangeTo - data.rangeFrom + 1 <= 500, {
    message: 'El rango máximo permitido es de 500 cubiertas',
    path: ['rangeTo'],
  });

type TireBulkFormValues = z.infer<typeof tireBulkFormSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface TireBulkFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryKey: (string | boolean | undefined)[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TireBulkForm({ open, onOpenChange, queryKey }: TireBulkFormProps) {
  const queryClient = useQueryClient();

  const { data: brands = [] } = useQuery({
    queryKey: ['tire-brands-select'],
    queryFn: () => getTireBrandsForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: tireTypes = [] } = useQuery({
    queryKey: ['tire-types-select'],
    queryFn: () => getTireTypesForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const form = useForm<TireBulkFormValues>({
    resolver: zodResolver(tireBulkFormSchema),
    defaultValues: {
      prefix: '',
      rangeFrom: 1,
      rangeTo: 10,
      brand_id: '',
      tire_type_id: '',
      is_new: true,
      retread_level: null,
      tread_depth: null,
      warehouseId: '',
      unitCost: '',
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['tire-warehouses-select'],
    queryFn: () => getTireWarehousesForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  // Con un solo depósito activo viene elegido.
  const watchedWarehouseId = useWatch({ control: form.control, name: 'warehouseId' });
  const effectiveWarehouseId = watchedWarehouseId || (warehouses.length === 1 ? warehouses[0]!.id : '');

  // Watch values for preview
  const watchedPrefix = useWatch({ control: form.control, name: 'prefix' });
  const watchedFrom = useWatch({ control: form.control, name: 'rangeFrom' });
  const watchedTo = useWatch({ control: form.control, name: 'rangeTo' });

  const rangeCount = watchedTo >= watchedFrom ? watchedTo - watchedFrom + 1 : 0;
  const previewFirst = watchedPrefix ? `${watchedPrefix}${watchedFrom}` : '-';
  const previewLast = watchedPrefix ? `${watchedPrefix}${watchedTo}` : '-';

  const mutation = useMutation({
    mutationFn: async (values: TireBulkFormValues) =>
      unwrapAction(
        await createTiresBulk({
          prefix: values.prefix,
          rangeFrom: values.rangeFrom,
          rangeTo: values.rangeTo,
          brand_id: values.brand_id,
          tire_type_id: values.tire_type_id,
          is_new: values.is_new,
          retread_level: values.retread_level ?? null,
          tread_depth: values.tread_depth ?? null,
          warehouseId: effectiveWarehouseId,
          unitCost: values.unitCost,
        })
      ),
    onSuccess: (result) => {
      toast.success(`Se crearon ${result.count} cubiertas correctamente`);
      queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      logger.error('Error in bulk tire creation', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al crear las cubiertas');
    },
  });

  async function onSubmit(values: TireBulkFormValues) {
    if (!effectiveWarehouseId) {
      form.setError('warehouseId', { message: 'Elegí el depósito' });
      return;
    }
    mutation.mutate(values);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) form.reset();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alta masiva de cubiertas</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Prefix + Range */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="prefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prefijo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: BRD-" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rangeFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rangeTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Preview */}
            {rangeCount > 0 && watchedPrefix && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Se crearán <strong className="text-foreground">{rangeCount}</strong> cubiertas (
                <strong className="text-foreground">{previewFirst}</strong> a{' '}
                <strong className="text-foreground">{previewLast}</strong>)
              </div>
            )}

            {/* Brand */}
            <FormField
              control={form.control}
              name="brand_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar marca..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tire Type */}
            <FormField
              control={form.control}
              name="tire_type_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de cubierta</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tireTypes.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>
                          {tt.size} — {tireTreadTypeLabels[tt.tread_type] ?? tt.tread_type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* Tread Depth */}
              <FormField
                control={form.control}
                name="tread_depth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profundidad (mm)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Ej: 12.5"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Is New */}
              <FormField
                control={form.control}
                name="is_new"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">{field.value ? 'Nueva' : 'Usada'}</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Retread Level */}
              <FormField
                control={form.control}
                name="retread_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precurado</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === '_none' ? null : (val as TireRetreadLevel))}
                      value={field.value ?? '_none'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin precurado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">Sin precurado</SelectItem>
                        {Object.values(TireRetreadLevel).map((level) => (
                          <SelectItem key={level} value={level}>
                            {tireRetreadLabels[level] ?? level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Stock */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depósito</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || effectiveWarehouseId}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar depósito..." />
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
              <FormField
                control={form.control}
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo unitario</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="Ej: 450000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending || rangeCount === 0}>
                {mutation.isPending ? 'Creando...' : `Crear ${rangeCount > 0 ? rangeCount : ''} cubiertas`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
