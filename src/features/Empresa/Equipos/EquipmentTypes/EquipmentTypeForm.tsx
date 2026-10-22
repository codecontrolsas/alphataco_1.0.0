import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy } from '@/shared/components/common/CatalogFormSheet';
import DependencyValidationModal, { DependencyConfig } from '@/shared/components/modal/DependencyValidationModal';
import {
  fetchDependenciesForValue,
  fetchReplacementOptions,
  reassignDependencies,
} from '@/shared/components/modal/dependency-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useActiveChecklists } from '../hooks/useActiveChecklists';
import { createEquipmentType, updateEquipmentType } from './actions.server';
import { computeIdDelta } from './lib/id-delta';

const logger = new Logger('EquipmentTypesForm');

/** Tipo a editar: sólo los campos que el formulario necesita de la fila. */
type VehicleType = {
  id: string;
  name: string;
  applies_to?: string | null;
  is_active?: boolean | null;
  is_operative?: boolean | null;
  is_tractor_unit?: boolean | null;
  has_hitch?: boolean | null;
};

interface EquipmentTypesFormProps {
  initialData?: VehicleType | null;
  onReset: () => void;
  isEditing?: boolean;
  onSuccess?: () => void;
  allTypes?: VehicleType[];
  initialHitchTypeIds?: string[];
  initialChecklistIds?: string[];
}

// Esquema de validación con Zod
const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  applies_to: z.enum(['vehicle', 'other_equipment']).default('vehicle'),
  is_active: z.boolean().default(true),
  is_operative: z.boolean().default(false),
  is_tractor_unit: z.boolean().default(false),
  has_hitch: z.boolean().default(false),
  hitch_type_ids: z.array(z.string()).default([]),
  checklist_ids: z.array(z.string()).default([]),
});

type FormData = z.infer<typeof formSchema>;

function EquipmentTypesForm({
  initialData = null,
  onReset,
  isEditing = false,
  onSuccess,
  allTypes = [],
  initialHitchTypeIds = [],
  initialChecklistIds = [],
}: EquipmentTypesFormProps) {
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const setBusy = useCatalogSheetBusy();
  const queryClient = useQueryClient();

  // Hook para obtener checklists activos
  const { data: checklists = [], isLoading: isLoadingChecklists } = useActiveChecklists();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      applies_to: 'vehicle',
      is_active: true,
      is_operative: false,
      is_tractor_unit: false,
      has_hitch: false,
      hitch_type_ids: [],
      checklist_ids: [],
    },
  });
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch,
  } = form;

  // Observar el valor de is_tractor_unit para controlar has_hitch
  const isTractorUnit = watch('is_tractor_unit');
  const hasHitch = watch('has_hitch');

  // Filtrar tipos que no son el tipo actual y no son unidad tractora (para el multi-select)
  const availableHitchTypes = useMemo(() => {
    return allTypes.filter((type) => type.id !== initialData?.id && !type.is_tractor_unit && type.is_active);
  }, [allTypes, initialData?.id]);

  // Resetear el formulario cuando cambia initialData
  // NOTA: El wrapper usa key={initialData?.id} para forzar remount limpio,
  // pero mantenemos este reset para el caso de edición → crear (null)
  useEffect(() => {
    if (initialData) {
      reset({
        id: initialData.id,
        name: initialData.name,
        applies_to: (initialData.applies_to as 'vehicle' | 'other_equipment') ?? 'vehicle',
        is_active: initialData.is_active ?? true,
        is_operative: initialData.is_operative ?? false,
        is_tractor_unit: initialData.is_tractor_unit ?? false,
        has_hitch: initialData.has_hitch ?? false,
        hitch_type_ids: initialHitchTypeIds,
        checklist_ids: initialChecklistIds,
      });
    } else {
      reset({
        name: '',
        applies_to: 'vehicle',
        is_active: true,
        is_operative: false,
        is_tractor_unit: false,
        has_hitch: false,
        hitch_type_ids: [],
        checklist_ids: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id]);

  // Handlers derivados — lógica movida de useEffect a handlers directos
  const handleTractorUnitChange = (checked: boolean) => {
    form.setValue('is_tractor_unit', checked);
    if (!checked) {
      form.setValue('has_hitch', false);
      form.setValue('hitch_type_ids', []);
    }
  };

  const handleHitchChange = (checked: boolean) => {
    form.setValue('has_hitch', checked);
    if (!checked) {
      form.setValue('hitch_type_ids', []);
    }
  };

  const onSubmit = async (data: FormData) => {
    setBusy(true);
    try {
      if (isEditing && initialData) {
        const prevActive = !!initialData.is_active;
        const nextActive = data.is_active;

        // Si se intenta cambiar a inactivo y el valor es diferente, abrir modal de dependencias
        if (prevActive && !nextActive) {
          //Awaite del fetch de dependencias
          const depData = await fetchDependencies(dependencyConfigs[0], initialData.id);

          if (depData.data.length) {
            setBusy(false);
            setShowDependencyModal(true);
            return; // No ejecutar update aún, el modal decidirá
          }
        }
        await updateEquipmentType({
          id: data.id!,
          name: data.name,
          applies_to: data.applies_to,
          is_active: data.is_active,
          is_operative: data.is_operative,
          is_tractor_unit: data.is_tractor_unit,
          has_hitch: data.has_hitch,
          hitches: computeIdDelta(initialHitchTypeIds, data.hitch_type_ids),
          checklists: computeIdDelta(initialChecklistIds, data.checklist_ids),
        });
        // Invalidar queries de React Query para refrescar los datos
        queryClient.invalidateQueries({ queryKey: ['type-checklists', data.id] });
        queryClient.invalidateQueries({ queryKey: ['type-hitch-types', data.id] });
        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });
        queryClient.invalidateQueries({ queryKey: ['equipment-types'] });
      } else {
        const result = await createEquipmentType({
          name: data.name,
          applies_to: data.applies_to,
          is_active: data.is_active,
          is_operative: data.is_operative,
          is_tractor_unit: data.is_tractor_unit,
          has_hitch: data.has_hitch,
          hitch_type_ids: data.hitch_type_ids,
          checklist_ids: data.checklist_ids,
        });
        // Invalidar queries de React Query para refrescar los datos
        if (result && 'id' in result) {
          queryClient.invalidateQueries({ queryKey: ['type-checklists', result.id] });
        }
        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });
        queryClient.invalidateQueries({ queryKey: ['equipment-types'] });
      }

      if (onSuccess) onSuccess();
      toast({
        title: 'Tipo de equipo guardado correctamente',
        description: 'Los cambios se han guardado exitosamente.',
        variant: 'default',
      });

      onReset();
    } catch (error: unknown) {
      logger.error('Error al guardar el tipo de equipo', { data: { error } });

      let errorMessage = 'Ocurrió un error al guardar. Por favor, inténtalo de nuevo.';

      // Extraer el mensaje de error de diferentes formatos de error
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        try {
          errorMessage = JSON.stringify(error);
        } catch (e) {
          errorMessage = String(error);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Mapear mensajes de error específicos
      if (errorMessage.includes('Tipo de vehículo no encontrado')) {
        errorMessage = 'No se encontró el tipo de vehículo a actualizar. Quizás fue eliminado por otro usuario.';
      } else if (errorMessage.includes('PGRST116') || errorMessage.includes('no rows returned')) {
        errorMessage = 'Error de base de datos: No se pudo completar la operación.';
      }

      setBusy(false);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const fetchDependencies = async (config: DependencyConfig, recordKeyValue: string) => {
    // Solicitamos solo las columnas que se van a mostrar
    const select = config.displayColumns.join(',') as '*';

    const data = await fetchDependenciesForValue<'vehicles', 'type'>({
      targetTable: 'vehicles',
      targetColumn: 'type',
      value: recordKeyValue,
      select,
      limit: 10,
    });

    return data;
  };

  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'type',
        sourceColumn: 'name',
        targetTable: 'vehicles',
        targetColumn: 'type',
        displayColumns: ['domain', 'chassis'],
        displayLabels: ['Dominio', 'Chassis'],
        relationName: 'Equipos',
      },
    ],
    []
  );

  const handleDependencyConfirm = async (action: 'force' | 'replace', replacementValue?: string) => {
    setShowDependencyModal(false);

    if (!initialData?.id) return;

    // Confirmación sin reemplazo: solo desactivar el registro
    if (action === 'force') {
      const values = form.getValues();
      await onSubmit(values);
      return;
    }

    // Reemplazo masivo y luego desactivar
    if (action === 'replace') {
      setBusy(true);
      try {
        // El modal sólo elige el reemplazo: la reasignación la hace el servidor. Sin esto el
        // tipo se desactivaba igual y los equipos quedaban apuntando a un tipo inactivo, con
        // toast de éxito.
        await reassignDependencies({
          targetTable: 'vehicles',
          targetColumn: dependencyConfigs[0].targetColumn,
          sourceTable: 'type',
          fromValue: initialData.id,
          toValue: replacementValue && replacementValue !== '__NULL__' ? replacementValue : null,
        });

        // Ahora sí, desactivar el registro actual
        const values = form.getValues();
        await updateEquipmentType({
          id: values.id!,
          name: values.name,
          applies_to: values.applies_to,
          is_active: values.is_active,
          is_operative: values.is_operative,
          is_tractor_unit: values.is_tractor_unit,
          has_hitch: values.has_hitch,
          hitches: computeIdDelta(initialHitchTypeIds, values.hitch_type_ids),
          checklists: computeIdDelta(initialChecklistIds, values.checklist_ids),
        });
        // Invalidar queries de React Query para refrescar los datos
        queryClient.invalidateQueries({ queryKey: ['type-checklists', values.id] });
        queryClient.invalidateQueries({ queryKey: ['type-hitch-types', values.id] });
        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });
        queryClient.invalidateQueries({ queryKey: ['equipment-types'] });
        if (onSuccess) onSuccess();
        onReset();
      } catch (err) {
        logger.error('Error al reemplazar referencias', { data: { err } });
        setBusy(false);
        toast({
          title: 'Error',
          description: 'No se pudieron reemplazar las referencias',
          variant: 'destructive',
        });
      }
    }
  };
  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            name="name"
            render={() => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ingrese el nombre del tipo de vehículo"
                    {...form.register('name')}
                    className={`w-full ${form.formState.errors.name ? 'border-danger' : ''}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Aplica a: Vehículos u Otros Equipos */}
          <FormField
            control={form.control}
            name="applies_to"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Aplica a</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === 'vehicle') {
                        // Al cambiar a vehículo, resetear is_operative ya que no aplica
                        form.setValue('is_operative', false);
                        form.setValue('checklist_ids', []);
                      }
                      if (value === 'other_equipment') {
                        // Al cambiar a otros equipos, resetear campos de vehículo
                        form.setValue('is_tractor_unit', false);
                        form.setValue('has_hitch', false);
                        form.setValue('hitch_type_ids', []);
                        form.setValue('checklist_ids', []);
                      }
                    }}
                    value={field.value}
                    className="flex space-x-1"
                  >
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="vehicle" />
                      </FormControl>
                      <FormLabel className="font-normal">Vehículos</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="other_equipment" />
                      </FormControl>
                      <FormLabel className="font-normal">Otros Equipos</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Switch Es Operativo - solo visible si aplica a otros equipos */}
          {form.watch('applies_to') === 'other_equipment' && (
            <FormField
              control={form.control}
              name="is_operative"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Es operativo</FormLabel>
                    <FormDescription>
                      Los equipos de este tipo aparecerán en el parte diario y podrán tener mantenimiento
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (!checked) {
                          form.setValue('checklist_ids', []);
                        }
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="is_active"
            render={() => (
              <FormItem className="space-y-3">
                <FormLabel>Activo</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => form.setValue('is_active', value === 'true')}
                    value={form.watch('is_active') ? 'true' : 'false'}
                    className="flex space-x-1"
                  >
                    <FormItem className="flex items-center space-x-6 space-y-0">
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

          {form.watch('applies_to') === 'vehicle' && (
            <FormField
              control={form.control}
              name="is_tractor_unit"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(checked) => handleTractorUnitChange(!!checked)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Unidad Tractora</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          )}

          {/* Checkbox Lleva Enganche - solo visible si es unidad tractora */}
          {isTractorUnit && (
            <FormField
              control={form.control}
              name="has_hitch"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-6">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(checked) => handleHitchChange(!!checked)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Lleva Enganche</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          )}

          {/* Multi-select de tipos compatibles para enganche - solo visible si lleva enganche */}
          {isTractorUnit && hasHitch && (
            <FormField
              control={form.control}
              name="hitch_type_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipos compatibles para enganche</FormLabel>
                  <FormControl>
                    <MultiSelectCombobox
                      options={availableHitchTypes.map((type) => ({
                        value: type.id,
                        label: type.name,
                      }))}
                      selectedValues={field.value}
                      onChange={field.onChange}
                      placeholder="Seleccione los tipos compatibles"
                      emptyMessage="No hay tipos disponibles"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Multi-select de checklists - oculto si es otros equipos no operativo */}
          {(form.watch('applies_to') === 'vehicle' || form.watch('is_operative')) && (
            <FormField
              control={form.control}
              name="checklist_ids"
              render={({ field }) => {
                const checklistOptions = checklists.map((checklist) => ({
                  value: checklist.id,
                  label: checklist.name || checklist.code || 'Sin nombre',
                }));

                return (
                  <FormItem>
                    <FormLabel>Checklists aplicables</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={checklistOptions}
                        selectedValues={field.value}
                        onChange={field.onChange}
                        placeholder={
                          isLoadingChecklists
                            ? 'Cargando checklists...'
                            : 'Seleccione los checklists que aplican a este tipo'
                        }
                        emptyMessage="No hay checklists disponibles"
                        disabled={isLoadingChecklists}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting} className="min-w-[100px]">
              {isEditing ? (isSubmitting ? 'Guardando...' : 'Guardar') : isSubmitting ? 'Creando...' : 'Crear'}
            </Button>
            <Button type="button" variant="outline" onClick={onReset} disabled={isSubmitting} className="min-w-[100px]">
              Cancelar
            </Button>
          </div>
        </form>
        {/* Modal de validación de dependencias reutilizable */}
        {isEditing && initialData && (
          <DependencyValidationModal
            isOpen={showDependencyModal}
            onClose={() => setShowDependencyModal(false)}
            onConfirm={handleDependencyConfirm}
            recordId={initialData.id || ''}
            recordName={initialData.name || ''}
            dependencies={dependencyConfigs}
            title="Confirmar desactivación"
            description="Este tipo de equipo está siendo utilizado por otros registros. Debe resolver estas referencias antes de desactivarlo."
            fetchDependencies={fetchDependencies}
            fetchReplacementOptions={fetchReplacementOptions}
          />
        )}
      </Form>
    </div>
  );
}

export default EquipmentTypesForm;
