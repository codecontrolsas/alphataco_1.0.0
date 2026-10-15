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
import { createCostCenterPrisma, updateCostCenterPrisma } from '../../CostCenter/actions.server';
import { useCostCenterStore } from './store/costCenter.store';

// ============================================================================
// SCHEMA
// ============================================================================

const CostCenterSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del centro de costo' }),
  is_active: z.boolean().default(true),
});

type CostCenterFormValues = z.infer<typeof CostCenterSchema>;

// ============================================================================
// COMPONENT
// ============================================================================

function CostCenterForm() {
  const editingCostCenter = useCostCenterStore((state) => state.costCenter);
  const setCostCenter = useCostCenterStore((state) => state.setCostCenter);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingCostCenter;

  const form = useForm<CostCenterFormValues>({
    resolver: zodResolver(CostCenterSchema),
    defaultValues: {
      name: '',
      is_active: true,
    },
  });

  // Sincronizar form cuando cambia el item a editar
  // useEffect aquí es válido: estamos sincronizando con un store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla)
  useEffect(() => {
    if (editingCostCenter) {
      form.reset({
        id: editingCostCenter.id,
        name: editingCostCenter.name,
        is_active: editingCostCenter.is_active ?? true,
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        is_active: true,
      });
    }
  }, [editingCostCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setCostCenter(null);
    form.reset({ id: undefined, name: '', is_active: true });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
  };

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleCreate = async (values: CostCenterFormValues) => {
    setBusy(true);
    toast.promise(createCostCenterPrisma({ name: values.name, is_active: values.is_active }), {
      loading: 'Creando centro de costo...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Centro de costo creado correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al crear el centro de costo';
      },
    });
  };

  const handleUpdate = async (values: CostCenterFormValues) => {
    if (!values.id) return;
    setBusy(true);
    toast.promise(updateCostCenterPrisma({ id: values.id, name: values.name, is_active: values.is_active }), {
      loading: 'Actualizando centro de costo...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Centro de costo actualizado correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al actualizar el centro de costo';
      },
    });
  };

  const handleSubmit = (values: CostCenterFormValues) => {
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
              <FormLabel>Nombre del Centro de Costo</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del centro de costo" />
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

export default CostCenterForm;
