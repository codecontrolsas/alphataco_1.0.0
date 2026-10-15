'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createEquipmentBrand, updateEquipmentBrand } from './actions.server';
import { useEquipmentBrandStore } from './store/equipmentBrand.store';

// ============================================================================
// SCHEMA
// ============================================================================

const EquipmentBrandSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre de la marca' }),
  is_active: z.boolean().default(true),
});

type EquipmentBrandFormValues = z.infer<typeof EquipmentBrandSchema>;

// ============================================================================
// COMPONENT
// ============================================================================

function EquipmentBrandForm() {
  const editingBrand = useEquipmentBrandStore((state) => state.equipmentBrand);
  const setEquipmentBrand = useEquipmentBrandStore((state) => state.setEquipmentBrand);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingBrand;

  const form = useForm<EquipmentBrandFormValues>({
    resolver: zodResolver(EquipmentBrandSchema),
    defaultValues: {
      name: '',
      is_active: true,
    },
  });

  // Sincronizar form cuando cambia el item a editar.
  // useEffect aquí es válido: sincronizamos con un store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla).
  useEffect(() => {
    if (editingBrand) {
      form.reset({
        id: editingBrand.id,
        name: editingBrand.name ?? '',
        is_active: editingBrand.is_active ?? true,
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        is_active: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBrand]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setEquipmentBrand(null);
    form.reset({ id: undefined, name: '', is_active: true });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-brands'] });
  };

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleCreate = async (values: EquipmentBrandFormValues) => {
    setBusy(true);
    toast.promise(createEquipmentBrand({ name: values.name, is_active: values.is_active }), {
      loading: 'Creando marca...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Marca creada correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al crear la marca';
      },
    });
  };

  const handleUpdate = async (values: EquipmentBrandFormValues) => {
    if (!values.id) return;
    setBusy(true);
    toast.promise(updateEquipmentBrand({ id: values.id, name: values.name, is_active: values.is_active }), {
      loading: 'Actualizando marca...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Marca actualizada correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al actualizar la marca';
      },
    });
  };

  const handleSubmit = (values: EquipmentBrandFormValues) => {
    if (isEditing) {
      handleUpdate(values);
    } else {
      handleCreate(values);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la Marca</FormLabel>
              <FormControl>
                <Input type="text" {...field} placeholder="Nombre de la marca de unidad" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                  className="flex space-x-1"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="true" />
                    </FormControl>
                    <FormLabel className="font-normal">Activo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
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

        <div className="flex gap-2 mt-6">
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? isEditing
                ? 'Actualizando...'
                : 'Creando...'
              : isEditing
                ? 'Actualizar'
                : 'Crear'}
          </Button>
          <Button type="button" onClick={resetForm} variant="outline">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default EquipmentBrandForm;
