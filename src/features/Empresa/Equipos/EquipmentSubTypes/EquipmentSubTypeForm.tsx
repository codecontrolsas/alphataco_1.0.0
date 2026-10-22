import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { computeIdDelta } from '../EquipmentTypes/lib/id-delta';
import { useActiveChecklists } from '../hooks/useActiveChecklists';
import { canHaveCompatibleItems, formatCompatibleItemKey, type CompatibleItem } from '../lib/hitch-compatibility';
import {
  createEquipmentSubType,
  getAvailableCompatibleItems,
  updateEquipmentSubType,
  type EquipmentSubTypeListItem,
} from './actions.server';

const logger = new Logger('EquipmentSubTypesForm');

/** Tipo de unidad tal como lo consume el selector del formulario. */
type VehicleType = { id: string; name: string; is_tractor_unit?: boolean | null; has_hitch?: boolean | null };
/** Subtipo a editar: sólo los campos que el formulario necesita de la fila. */
type VehicleSubType = Pick<EquipmentSubTypeListItem, 'id' | 'name' | 'is_active' | 'type'>;
/** Item compatible disponible (subtipo del tipo enganchable). */
type AvailableSubType = Awaited<ReturnType<typeof getAvailableCompatibleItems>>['subTypes'][number];
type AvailableType = Awaited<ReturnType<typeof getAvailableCompatibleItems>>['types'][number];

interface EquipmentSubTypesFormProps {
  initialData?: VehicleSubType | null;
  onReset: () => void;
  isEditing?: boolean;
  onSuccess?: () => void;
  types: VehicleType[];
  initialCompatibleItems?: CompatibleItem[];
  initialChecklistIds?: string[];
}

// Esquema de validación con Zod
const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  type_id: z.string().min(1, 'El tipo es requerido'),
  is_active: z.boolean().default(true),
  compatible_item_ids: z.array(z.string()).default([]),
  checklist_ids: z.array(z.string()).default([]),
});

type FormData = z.infer<typeof formSchema>;

function EquipmentSubTypesForm({
  initialData = null,
  onReset,
  isEditing = false,
  onSuccess,
  types,
  initialCompatibleItems = [],
  initialChecklistIds = [],
}: EquipmentSubTypesFormProps) {
  const [showDependencyModal, setShowDependencyModal] = useState(false);
  const setBusy = useCatalogSheetBusy();
  const [availableItems, setAvailableItems] = useState<{ subTypes: AvailableSubType[]; types: AvailableType[] }>({
    subTypes: [],
    types: [],
  });
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Hook para obtener checklists activos
  const { data: checklists = [], isLoading: isLoadingChecklists, error: checklistsError } = useActiveChecklists();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          id: initialData.id,
          name: initialData.name ?? '',
          is_active: initialData.is_active ?? true,
          type_id: initialData.type ?? '',
          compatible_item_ids: initialCompatibleItems?.map(formatCompatibleItemKey) ?? [],
          checklist_ids: initialChecklistIds ?? [],
        }
      : {
          name: '',
          is_active: true,
          type_id: '',
          compatible_item_ids: [],
          checklist_ids: [],
        },
  });

  const queryClient = useQueryClient();
  // Base leída al abrir el formulario: contra ella se calcula el delta {add, remove} que se envía.
  const initialCompatibleKeys = useMemo(
    () => initialCompatibleItems.map(formatCompatibleItemKey),
    [initialCompatibleItems]
  );
  const {
    handleSubmit,
    formState: { isSubmitting },
    watch,
  } = form;

  const selectedTypeId = watch('type_id');

  // Obtener el tipo seleccionado
  const selectedType = useMemo(() => {
    return types.find((t) => t.id === selectedTypeId);
  }, [types, selectedTypeId]);

  // Verificar si el tipo padre es unidad tractora y tiene enganche
  const showCompatibleItems = useMemo(() => canHaveCompatibleItems(selectedType), [selectedType]);

  // Cargar items compatibles disponibles cuando cambia el tipo seleccionado
  const loadAvailableItems = useCallback(async (typeId: string) => {
    setIsLoadingItems(true);

    try {
      const result = await getAvailableCompatibleItems(typeId);
      setAvailableItems({
        subTypes: result.subTypes || [],
        types: result.types || [],
      });
    } catch (error) {
      logger.error('Error al cargar items compatibles', { data: { error } });
      setAvailableItems({ subTypes: [], types: [] });
    } finally {
      setIsLoadingItems(false);
    }
  }, []);

  // Cargar items disponibles cuando cambia el tipo seleccionado
  useEffect(() => {
    if (selectedTypeId && showCompatibleItems) {
      loadAvailableItems(selectedTypeId);
    } else {
      setAvailableItems({ subTypes: [], types: [] });
    }
  }, [selectedTypeId, showCompatibleItems, loadAvailableItems]);

  // Opciones para el multi-select de checklists
  const checklistOptions = useMemo(() => {
    return checklists.map((checklist) => ({
      value: checklist.id,
      label: checklist.name,
    }));
  }, [checklists]);

  // Mostrar error si hay problema cargando checklists
  useEffect(() => {
    if (checklistsError) {
      logger.error('Error al cargar checklists', { data: { error: checklistsError } });
    }
  }, [checklistsError]);

  // Opciones para el multi-select combinando subtipos y tipos
  const compatibleItemOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];

    // Agregar subtipos
    availableItems.subTypes.forEach((st) => {
      const parentType = types.find((t) => t.id === st.type);
      options.push({
        value: `sub_type:${st.id}`,
        label: `${st.name} (${parentType?.name || 'Sin tipo'})`,
      });
    });

    // Agregar tipos sin subtipos
    availableItems.types.forEach((t) => {
      options.push({
        value: `type:${t.id}`,
        label: `${t.name} (Tipo)`,
      });
    });

    return options;
  }, [availableItems, types]);

  // El reset del formulario se maneja via key={editingItem?.id} en el wrapper padre.
  // Cuando cambia el item editado, React remonta el componente con defaultValues frescos.
  // NO usar useEffect para resetear — causa loops infinitos con form en deps.

  // Handler para cuando cambia el tipo — resetea compatible_item_ids
  // (Lógica movida de useEffect a handler directo para evitar loop infinito con `form` en deps)
  const handleTypeChange = useCallback(
    (newTypeId: string) => {
      form.setValue('type_id', newTypeId);
      if (!isEditing) {
        form.setValue('compatible_item_ids', []);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEditing]
  );

  const onSubmit = async (data: FormData) => {
    setBusy(true);
    try {
      if (isEditing && data.id) {
        const prevActive = !!initialData?.is_active;
        const nextActive = data.is_active;

        // Si se intenta cambiar a inactivo y el valor es diferente, abrir modal de dependencias
        if (prevActive && !nextActive) {
          const depData = await fetchDependencies(dependencyConfigs[0], initialData!.id);

          if (depData.data.length) {
            setBusy(false);
            setShowDependencyModal(true);
            return; // No ejecutar update aún, el modal decidirá
          }
        }
        await updateEquipmentSubType({
          id: data.id,
          name: data.name,
          is_active: data.is_active,
          type_id: data.type_id,
          compatibleItems: computeIdDelta(initialCompatibleKeys, data.compatible_item_ids),
          checklists: computeIdDelta(initialChecklistIds, data.checklist_ids),
        });

        queryClient.invalidateQueries({ queryKey: ['subtype-checklists', data.id] });
        queryClient.invalidateQueries({ queryKey: ['subtype-compatible-items', data.id] });
        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });
      } else {
        await createEquipmentSubType({
          name: data.name,
          is_active: data.is_active,
          type_id: data.type_id,
          compatible_item_keys: data.compatible_item_ids,
          checklist_ids: data.checklist_ids,
        });

        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });
      }

      if (onSuccess) onSuccess();
      toast({
        title: 'Subtipo de equipo guardado correctamente',
        description: 'Los cambios se han guardado exitosamente.',
        variant: 'default',
      });

      onReset();
    } catch (error: unknown) {
      logger.error('Error al guardar el subtipo de equipo', { data: { error } });

      let errorMessage = 'Ocurrió un error al guardar. Por favor, inténtalo de nuevo.';

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

      if (errorMessage.includes('Subtipo de vehículo no encontrado')) {
        errorMessage = 'No se encontró el subtipo de vehículo a actualizar. Quizás fue eliminado por otro usuario.';
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
    const select = config.displayColumns.join(',') as '*';

    const data = await fetchDependenciesForValue<'vehicles', 'subType'>({
      targetTable: 'vehicles',
      targetColumn: 'subType',
      value: recordKeyValue,
      select,
      limit: 10,
    });

    return data;
  };

  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'sub_type',
        sourceColumn: 'name',
        targetTable: 'vehicles',
        targetColumn: 'subType',
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
        await reassignDependencies({
          targetTable: 'vehicles',
          targetColumn: dependencyConfigs[0].targetColumn,
          sourceTable: 'sub_type',
          fromValue: initialData.id,
          toValue: replacementValue && replacementValue !== '__NULL__' ? replacementValue : null,
        });

        // Ahora sí, desactivar el registro actual
        const values = form.getValues();
        await updateEquipmentSubType({
          id: values.id!,
          name: values.name,
          is_active: values.is_active,
          type_id: values.type_id,
          compatibleItems: computeIdDelta(initialCompatibleKeys, values.compatible_item_ids),
          checklists: computeIdDelta(initialChecklistIds, values.checklist_ids),
        });

        queryClient.invalidateQueries({ queryKey: ['subtype-checklists', values.id] });
        queryClient.invalidateQueries({ queryKey: ['subtype-compatible-items', values.id] });
        queryClient.invalidateQueries({ queryKey: ['active-checklists'] });

        if (onSuccess) onSuccess();
        onReset();
      } catch (err) {
        logger.error('Error al reemplazar referencias', { data: { error: err } });
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-full">
          <FormField
            name="name"
            render={() => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ingrese el nombre del subtipo de equipo"
                    {...form.register('name')}
                    className={form.formState.errors.name ? 'border-danger' : ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            name="type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Unidad</FormLabel>
                <Select onValueChange={handleTypeChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
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

          {/* Multi-select de items compatibles - solo visible si el tipo padre tiene enganche */}
          {showCompatibleItems && (
            <FormField
              control={form.control}
              name="compatible_item_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subtipos/Tipos compatibles para enganche</FormLabel>
                  <FormControl>
                    <MultiSelectCombobox
                      options={compatibleItemOptions}
                      selectedValues={field.value}
                      onChange={field.onChange}
                      placeholder={isLoadingItems ? 'Cargando...' : 'Seleccione los items compatibles'}
                      emptyMessage="No hay items disponibles"
                      disabled={isLoadingItems}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Multi-select de checklists */}
          <FormField
            control={form.control}
            name="checklist_ids"
            render={({ field }) => (
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
                        : 'Seleccione los checklists que aplican a este subtipo'
                    }
                    emptyMessage="No hay checklists disponibles"
                    disabled={isLoadingChecklists}
                  />
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
            description="Este subtipo de equipo está siendo utilizado por otros registros. Debe resolver estas referencias antes de desactivarlo."
            fetchDependencies={fetchDependencies}
            fetchReplacementOptions={fetchReplacementOptions}
          />
        )}
      </Form>
    </div>
  );
}

export default EquipmentSubTypesForm;
