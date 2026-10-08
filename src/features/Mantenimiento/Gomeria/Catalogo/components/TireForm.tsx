'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { tireRetreadLabels, tireTreadTypeLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { getTireTypesForSelect } from '@/features/Mantenimiento/Gomeria/Tipos/actions/actions.server';
import { TireRetreadLevel } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { DECIMAL_RE } from '@/features/Warehouses/schemas/stock-movement';
import {
  createTire,
  getTireBrandsForSelect,
  getTireWarehousesForSelect,
  updateTire,
  type TireListItem,
} from '../actions/actions.server';

const logger = new Logger('TireForm');

// ============================================================================
// SCHEMA
// ============================================================================

const tireFormSchema = z.object({
  serial_number: z.string().min(1, 'El número de serie es requerido'),
  brand_id: z.string().uuid('Seleccione una marca válida'),
  tire_type_id: z.string().uuid('Seleccione un tipo de cubierta'),
  is_new: z.boolean().default(true),
  retread_level: z.nativeEnum(TireRetreadLevel).nullable().optional(),
  tread_depth: z.coerce.number().positive('Debe ser positivo').nullable().optional(),
  /** Solo en el alta: la cubierta entra al stock (Almacenes etapa 6). */
  warehouseId: z.string(),
  unitCost: z.string(),
});

/**
 * El alta exige costo unitario: la cubierta entra al stock con una entrada. El depósito se
 * controla al enviar, porque con uno solo viene elegido sin que el usuario toque el campo.
 */
const createTireFormSchema = tireFormSchema.superRefine((v, ctx) => {
  if (!DECIMAL_RE.test(v.unitCost.trim())) {
    ctx.addIssue({ code: 'custom', path: ['unitCost'], message: 'Costo inválido (hasta 4 decimales)' });
  }
});

type TireFormValues = z.infer<typeof tireFormSchema>;

const EMPTY_VALUES: TireFormValues = {
  serial_number: '',
  brand_id: '',
  tire_type_id: '',
  is_new: true,
  retread_level: null,
  tread_depth: null,
  warehouseId: '',
  unitCost: '',
};

// ============================================================================
// PROPS
// ============================================================================

interface TireFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tire?: TireListItem;
  queryKey: (string | boolean | undefined)[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TireForm({ open, onOpenChange, tire, queryKey }: TireFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!tire;
  // Con stock, la serie, la marca y el tipo definen su material y su unidad: no se cambian.
  const hasStock = !!tire?.material_unit;

  // Load brands
  const { data: brands = [], isLoading: isLoadingBrands } = useQuery({
    queryKey: ['tire-brands-select'],
    queryFn: () => getTireBrandsForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Load tire types
  const { data: tireTypes = [], isLoading: isLoadingTypes } = useQuery({
    queryKey: ['tire-types-select'],
    queryFn: () => getTireTypesForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['tire-warehouses-select'],
    queryFn: () => getTireWarehousesForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open && !isEditing,
  });

  const form = useForm<TireFormValues>({
    resolver: zodResolver(isEditing ? tireFormSchema : createTireFormSchema),
    defaultValues: tire
      ? {
          serial_number: tire.serial_number,
          brand_id: tire.brand_id,
          tire_type_id: tire.tire_type_id,
          is_new: tire.is_new,
          retread_level: (tire.retread_level as TireRetreadLevel | null) ?? null,
          tread_depth: tire.tread_depth != null ? Number(tire.tread_depth) : null,
          warehouseId: '',
          unitCost: '',
        }
      : EMPTY_VALUES,
  });

  // Con un solo depósito activo viene elegido.
  const selectedWarehouseId = form.watch('warehouseId');
  const effectiveWarehouseId = selectedWarehouseId || (warehouses.length === 1 ? warehouses[0]!.id : '');

  const mutation = useMutation({
    mutationFn: async (values: TireFormValues) => {
      if (isEditing && tire) {
        unwrapAction(
          await updateTire(tire.id, {
            serial_number: values.serial_number,
            brand_id: values.brand_id,
            tire_type_id: values.tire_type_id,
            is_new: values.is_new,
            retread_level: values.retread_level ?? null,
            tread_depth: values.tread_depth ?? null,
          })
        );
      } else {
        unwrapAction(
          await createTire({
            serial_number: values.serial_number,
            brand_id: values.brand_id,
            tire_type_id: values.tire_type_id,
            is_new: values.is_new,
            retread_level: values.retread_level ?? null,
            tread_depth: values.tread_depth ?? null,
            warehouseId: effectiveWarehouseId,
            unitCost: values.unitCost,
          })
        );
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Cubierta actualizada correctamente' : 'Cubierta creada correctamente');
      queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
    },
    onError: (error) => {
      logger.error('Error saving tire', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al guardar la cubierta');
    },
  });

  async function onSubmit(values: TireFormValues) {
    if (!isEditing && !effectiveWarehouseId) {
      form.setError('warehouseId', { message: 'Elegí el depósito' });
      return;
    }
    mutation.mutate(values);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !tire) {
      // Only reset to empty when opening for create (no tire prop).
      // For edit mode, the component remounts with tire data already in defaultValues.
      form.reset(EMPTY_VALUES);
    }
    onOpenChange(nextOpen);
  }

  const isNew = form.watch('is_new');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar cubierta' : 'Nueva cubierta'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {hasStock && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                La cubierta está en el stock de Almacenes: la serie, la marca y el tipo no se cambian.
              </p>
            )}
            {/* Serial Number — full width */}
            <FormField
              control={form.control}
              name="serial_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de serie</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: ABC001" readOnly={hasStock} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Brand + Tire Type — 2 columns */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="brand_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca</FormLabel>
                    {isLoadingBrands ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value} disabled={hasStock}>
                        <FormControl>
                          <SelectTrigger className="w-full">
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
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tire_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de cubierta</FormLabel>
                    {isLoadingTypes ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value} disabled={hasStock}>
                        <FormControl>
                          <SelectTrigger className="w-full">
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
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Condition + Depth — 2 columns */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="is_new"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border px-3 py-2.5">
                    <FormLabel className="text-sm font-normal">{field.value ? 'Nueva' : 'Usada'}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tread_depth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desgaste (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Ej: 75"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Retread — only when used, full width */}
            {!isNew && (
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
                        <SelectTrigger className="w-full">
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
            )}

            {/* Stock — solo en el alta */}
            {!isEditing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depósito</FormLabel>
                      {isLoadingWarehouses ? (
                        <Skeleton className="h-9 w-full rounded-md" />
                      ) : (
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
                      )}
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
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear cubierta'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
