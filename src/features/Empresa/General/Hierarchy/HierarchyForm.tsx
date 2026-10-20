'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createHierarchyPrisma, getHierarchyParentOptions, updateHierarchyPrisma } from './actions.server';
import { ROOT_SECTOR_LABEL } from './columns';
import { useHierarchyStore } from './store/hierarchy.store';

// ============================================================================
// SCHEMA
// ============================================================================

const HierarchySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del sector' }),
  is_active: z.boolean().default(true),
  /** Sector del que depende. Cadena vacía = sector raíz (se envía como null). */
  parent_id: z.string().default(''),
});

/** Valor del combo para "Ninguno (sector raíz)". */
const NO_PARENT = '__none__';

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
      parent_id: '',
    },
  });

  // Opciones de "Depende de": excluyen el sector editado y sus dependientes (evita ciclos)
  const { data: parentOptions, isLoading: isLoadingParents } = useQuery({
    queryKey: ['hierarchy-parent-options', editingHierarchy?.id ?? null, editingHierarchy?.parent_id ?? null],
    queryFn: () => getHierarchyParentOptions(editingHierarchy?.id, editingHierarchy?.parent_id),
    staleTime: 60 * 1000,
  });

  const comboOptions = useMemo(
    () => [
      { value: NO_PARENT, label: ROOT_SECTOR_LABEL },
      ...(parentOptions ?? []).map((o) => ({ value: o.id, label: o.name })),
    ],
    [parentOptions]
  );

  // Sincronizar form cuando cambia el item a editar.
  // useEffect es válido aquí: estamos sincronizando con un store externo (Zustand)
  // que puede cambiar desde fuera (click en botón "Editar" de la tabla).
  useEffect(() => {
    if (editingHierarchy) {
      form.reset({
        id: editingHierarchy.id,
        name: editingHierarchy.name,
        is_active: editingHierarchy.is_active ?? true,
        parent_id: editingHierarchy.parent_id ?? '',
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        is_active: true,
        parent_id: '',
      });
    }
  }, [editingHierarchy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setHierarchy(null);
    form.reset({ id: undefined, name: '', is_active: true, parent_id: '' });
    closeSheet();
  };

  const invalidateTable = () => {
    queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
    queryClient.invalidateQueries({ queryKey: ['hierarchy-parent-options'] });
    queryClient.invalidateQueries({ queryKey: ['org-chart'] });
  };

  // ── Submit handlers ────────────────────────────────────────────────────────

  // Las acciones devuelven el error como dato: el mensaje (p. ej. un ciclo de dependencia) llega tal cual.
  const save = async (values: HierarchyFormValues) => {
    setBusy(true);
    const payload = { name: values.name, is_active: values.is_active, parent_id: values.parent_id || null };
    try {
      const result = values.id
        ? await updateHierarchyPrisma({ ...payload, id: values.id })
        : await createHierarchyPrisma(payload);
      if (!result.ok) {
        setBusy(false);
        toast.error(result.error);
        return;
      }
      invalidateTable();
      resetForm();
      toast.success(values.id ? 'Sector actualizado correctamente' : 'Sector creado correctamente');
    } catch {
      setBusy(false);
      toast.error(values.id ? 'Error al actualizar el sector' : 'Error al crear el sector');
    }
  };

  const handleSubmit = (values: HierarchyFormValues) => save(isEditing ? values : { ...values, id: undefined });

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
          name="parent_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Depende de</FormLabel>
              <FormControl>
                <MultiSelectCombobox
                  options={comboOptions}
                  placeholder="Seleccionar sector"
                  searchPlaceholder="Buscar sector..."
                  emptyMessage="No hay sectores"
                  selectedValues={field.value ? [field.value] : [NO_PARENT]}
                  onChange={(values) => {
                    // Un solo valor; volver a tocar el elegido (o "Ninguno") deja el sector como raíz
                    const next = values[0] ?? '';
                    field.onChange(next === NO_PARENT ? '' : next);
                  }}
                  maxSelections={1}
                  closeOnSelect
                  disabled={isLoadingParents}
                  isLoading={isLoadingParents}
                />
              </FormControl>
              <FormDescription>Sector del que depende en el organigrama</FormDescription>
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
