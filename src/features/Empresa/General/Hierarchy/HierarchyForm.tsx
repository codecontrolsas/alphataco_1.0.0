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
import { createHierarchyPrisma, updateHierarchyPrisma } from './actions.server';
import { useHierarchyStore } from './store/hierarchy.store';

// ============================================================================
// SCHEMA
// ============================================================================

const HierarchySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del sector' }),
  is_active: z.boolean().default(true),
});

type HierarchyFormValues = z.infer<typeof HierarchySchema>;

// ============================================================================
// COMPONENT
// ============================================================================

function HierarchyForm() {
  const editingHierarchy = useHierarchyStore((state) => state.hierarchy);
  const setHierarchy = useHierarchyStore((state) => state.setHierarchy);
  const queryClient = useQueryClient();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const isEditing = !!editingHierarchy;

  const form = useForm<HierarchyFormValues>({
    resolver: zodResolver(HierarchySchema),
    defaultValues: {
      name: '',
      is_active: true,
    },
  });

  // Sincronizar form cuando cambia el item a editar.
  // useEffect es válido aquí: estamos sincronizando con un store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla).
  useEffect(() => {
    if (editingHierarchy) {
      form.reset({
        id: editingHierarchy.id,
        name: editingHierarchy.name,
        is_active: editingHierarchy.is_active ?? true,
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        is_active: true,
      });
    }
  }, [editingHierarchy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setHierarchy(null);
    form.reset({ id: undefined, name: '', is_active: true });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
  };

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleCreate = async (values: HierarchyFormValues) => {
    setBusy(true);
    toast.promise(createHierarchyPrisma({ name: values.name, is_active: values.is_active }), {
      loading: 'Creando sector...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Sector creado correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al crear el sector';
      },
    });
  };

  const handleUpdate = async (values: HierarchyFormValues) => {
    if (!values.id) return;
    setBusy(true);
    toast.promise(updateHierarchyPrisma({ id: values.id, name: values.name, is_active: values.is_active }), {
      loading: 'Actualizando sector...',
      success: () => {
        invalidateTable();
        resetForm();
        return 'Sector actualizado correctamente';
      },
      error: () => {
        setBusy(false);
        return 'Error al actualizar el sector';
      },
    });
  };

  const handleSubmit = (values: HierarchyFormValues) => {
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
              <FormLabel>Nombre del Sector</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del sector" />
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

export default HierarchyForm;
