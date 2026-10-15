'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { useCatalogSheetBusy } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createMaintenanceGroupAction,
  fetchMaintenanceGroupByIdAction,
  fetchMaintenanceGroupsActionType,
  fetchTypesOfRepairActionType,
  updateMaintenanceGroupAction,
} from './actions/maintenanceGroupActions';
import { maintenanceGroupFormSchema, type MaintenanceGroupFormValues } from './schemas/repair-types';

type Group = fetchMaintenanceGroupsActionType['groups'][number];

interface MaintenanceGroupFormProps {
  group: Group | null;
  onDone: () => void;
  types: fetchTypesOfRepairActionType['types'];
}

const EMPTY_VALUES: MaintenanceGroupFormValues = { name: '', description: '', is_active: true, type_ids: [] };

/** Altas y bajas respecto del baseline que se leyó de la base al abrir el grupo. */
function diffIds(baseline: string[], current: string[]) {
  return {
    add: current.filter((id) => !baseline.includes(id)),
    remove: baseline.filter((id) => !current.includes(id)),
  };
}

interface FormBodyProps {
  group: { id: string; name: string; description: string | null; is_active: boolean } | null;
  /** Tipos del grupo según la base al abrirlo; `[]` si se crea uno nuevo. */
  baselineTypeIds: string[];
  types: fetchTypesOfRepairActionType['types'];
  onDone: () => void;
}

function MaintenanceGroupFormBody({ group, baselineTypeIds, types, onDone }: FormBodyProps) {
  const isEditing = !!group;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const setBusy = useCatalogSheetBusy();

  const form = useForm<MaintenanceGroupFormValues>({
    resolver: zodResolver(maintenanceGroupFormSchema),
    defaultValues: group
      ? {
          name: group.name,
          description: group.description ?? '',
          is_active: group.is_active,
          type_ids: baselineTypeIds,
        }
      : EMPTY_VALUES,
  });

  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const selectedTypeIds = form.watch('type_ids');
  const delta = diffIds(baselineTypeIds, selectedTypeIds);
  const removedNames = delta.remove.map((id) => typeNames.get(id) ?? 'Tipo').join(', ');

  const afterMutation = () => {
    invalidateAllMaintenanceQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ['maintenance-group'] });
    queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
    // Primero se cierra el Sheet y después se refresca la ruta.
    onDone();
    router.refresh();
  };

  const handleSubmit = async (values: MaintenanceGroupFormValues) => {
    if (isSaving) return;
    setIsSaving(true);
    setBusy(true);
    try {
      const groupData = { name: values.name, description: values.description, is_active: values.is_active };
      if (!group) {
        const result = await createMaintenanceGroupAction(groupData, values.type_ids);
        if (result.error) throw new Error(result.error);
        toast.success('Grupo de reparación creado con éxito');
      } else {
        const result = await updateMaintenanceGroupAction(group.id, groupData, delta);
        if (result.error) throw new Error(result.error);
        toast.success(
          `Grupo de reparación actualizado con éxito (${result.added} tipos agregados, ${result.removed} quitados)`
        );
      }
      afterMutation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar el grupo');
    } finally {
      setBusy(false);
      setIsSaving(false);
    }
  };

  const repairTypesOptions = types.map((type) => ({ value: type.id, label: type.name }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del grupo</FormLabel>
              <FormControl>
                <Input type="text" {...field} placeholder="Nombre del grupo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Descripción del grupo"
                  className="min-h-[60px] resize-y"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipos de reparación asociados</FormLabel>
              <FormControl>
                <MultiSelectCombobox
                  options={repairTypesOptions}
                  emptyMessage="No hay tipos de reparación"
                  selectedValues={field.value || []}
                  onChange={field.onChange}
                  placeholder="Seleccione tipos de reparación"
                />
              </FormControl>
              <FormMessage />
              {isEditing && (delta.add.length > 0 || delta.remove.length > 0) && (
                <div className="space-y-0.5 text-xs" aria-live="polite">
                  {delta.add.length > 0 && <p className="text-muted-foreground">Se agregan {delta.add.length}</p>}
                  {delta.remove.length > 0 && (
                    <p className="font-medium text-destructive">
                      Se quitan {delta.remove.length}: {removedNames}
                    </p>
                  )}
                </div>
              )}
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
          <Button variant="brand" type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando...' : isEditing ? 'Editar' : 'Crear'}
          </Button>
          <Button type="button" onClick={onDone} variant="outline" disabled={isSaving}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Al editar, los tipos actuales del grupo se leen de la base (no de la lista de la pantalla)
 * y el formulario recién se arma cuando llegaron: las bajas se calculan contra ese dato.
 */
function MaintenanceGroupForm({ group, types, onDone }: MaintenanceGroupFormProps) {
  const baselineQuery = useQuery({
    queryKey: ['maintenance-group', group?.id],
    queryFn: () => fetchMaintenanceGroupByIdAction(group!.id),
    enabled: !!group,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  if (!group) {
    return <MaintenanceGroupFormBody key="new" group={null} baselineTypeIds={[]} types={types} onDone={onDone} />;
  }

  if (baselineQuery.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const fresh = baselineQuery.data?.group ?? null;
  if (baselineQuery.isError || baselineQuery.data?.error || !fresh) {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p className="text-destructive">No se pudieron cargar los datos actuales del grupo.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => baselineQuery.refetch()}>
            Reintentar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MaintenanceGroupFormBody
      key={`${fresh.id}-${baselineQuery.dataUpdatedAt}`}
      group={fresh}
      baselineTypeIds={fresh.maintenance_group_type_of_repairs.map((rel) => rel.type_id)}
      types={types}
      onDone={onDone}
    />
  );
}

export default MaintenanceGroupForm;
