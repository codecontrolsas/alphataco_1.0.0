'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  createEquipmentModelPrisma,
  getActiveBrandsForSelect,
  updateEquipmentModelPrisma,
  type BrandForSelect,
  type EquipmentModelListItem,
} from './actions.server';

const logger = new Logger('features/Empresa/Equipos/EquipmentModels/EquipmentModelForm');

// ============================================================================
// SCHEMA
// ============================================================================

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es requerido')
    .refine((value) => value.trim() !== '', { message: 'El nombre no puede estar vacío' }),
  brand: z.string().min(1, 'Debe seleccionar una marca'),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface EquipmentModelFormProps {
  editingItem?: EquipmentModelListItem | null;
  onReset: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EquipmentModelForm({ editingItem, onReset }: EquipmentModelFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editingItem;
  const setBusy = useCatalogSheetBusy();

  // Cargar marcas activas para el select
  const { data: brands = [] } = useQuery<BrandForSelect[]>({
    queryKey: ['brands-for-select'],
    queryFn: () => getActiveBrandsForSelect(),
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      brand: '',
      is_active: true,
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch,
    setValue,
  } = form;

  // Sincronizar formulario cuando cambia el item a editar
  useEffect(() => {
    if (editingItem) {
      reset({
        name: editingItem.name ?? '',
        brand: editingItem.brand != null ? String(editingItem.brand) : '',
        is_active: editingItem.is_active ?? true,
      });
    } else {
      reset({ name: '', brand: '', is_active: true });
    }
  }, [editingItem, reset]);

  const onSubmit = async (data: FormValues) => {
    setBusy(true);
    try {
      const result =
        isEditing && editingItem
          ? await updateEquipmentModelPrisma({
              id: Number(editingItem.id),
              name: data.name,
              brand: Number(data.brand),
              is_active: data.is_active,
            })
          : await createEquipmentModelPrisma({
              name: data.name,
              brand: Number(data.brand),
              is_active: data.is_active,
            });

      // La accion devuelve el motivo como dato (no lo lanza) para que sobreviva
      // al build de produccion, donde Next oculta los mensajes de Error.
      if (!result.ok) {
        setBusy(false);
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
        return;
      }

      // Invalidar la query de la tabla para refetch
      await queryClient.invalidateQueries({ queryKey: ['equipment-models'] });

      toast({
        title: isEditing ? 'Modelo actualizado' : 'Modelo creado',
        description: 'Los cambios se guardaron exitosamente.',
        variant: 'default',
      });

      onReset();
    } catch (error) {
      logger.error('Error al guardar el modelo de equipo', { data: { error } });
      const message = error instanceof Error ? error.message : 'Ocurrió un error al guardar. Intente nuevamente.';
      setBusy(false);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Marca */}
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Marca</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccione una marca" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={String(brand.id)} value={String(brand.id)}>
                          {brand.name ?? `Marca ${brand.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Nombre */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Modelo</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el nombre del modelo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Estado */}
          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => field.onChange(value === 'true')}
                    value={field.value ? 'true' : 'false'}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="true" />
                      </FormControl>
                      <FormLabel className="font-normal">Activo</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="false" />
                      </FormControl>
                      <FormLabel className="font-normal">Inactivo</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="min-w-[100px]">
              {isEditing ? (isSubmitting ? 'Guardando...' : 'Guardar') : isSubmitting ? 'Creando...' : 'Crear'}
            </Button>
            <Button type="button" variant="outline" onClick={onReset} disabled={isSubmitting} className="min-w-[100px]">
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
