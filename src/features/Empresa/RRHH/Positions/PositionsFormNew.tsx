'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy } from '@/shared/components/common/CatalogFormSheet';
import DependencyValidationModal, { type DependencyConfig } from '@/shared/components/modal/DependencyValidationModal';
import {
  fetchDependenciesForValue,
  fetchReplacementOptions,
  reassignDependencies,
} from '@/shared/components/modal/dependency-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  createPositionPrisma,
  getAllAptitudesForForm,
  getAllHierarchiesForForm,
  getPositionAptitudeIds,
  updatePositionPrisma,
  type PositionListItem,
} from './actions.server';

const logger = new Logger('PositionsFormNew');

// ============================================================================
// SCHEMA
// ============================================================================

const PositionSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido' }),
  is_active: z.boolean(),
  hierarchical_position_id: z.array(z.string()).optional(),
});

type PositionFormValues = z.infer<typeof PositionSchema>;

// ============================================================================
// PROPS
// ============================================================================

interface PositionsFormNewProps {
  selectedPosition: PositionListItem | null;
  onDone: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PositionsFormNew({ selectedPosition, onDone }: PositionsFormNewProps) {
  const queryClient = useQueryClient();
  const setBusy = useCatalogSheetBusy();
  const isEditing = selectedPosition !== null;
  const [showDependencyModal, setShowDependencyModal] = useState(false);

  // ── Catálogos (lazy-load on demand) ──────────────────────────────────────
  const { data: hierarchies = [] } = useQuery({
    queryKey: ['hierarchies-for-form'],
    queryFn: getAllHierarchiesForForm,
    staleTime: 5 * 60 * 1000,
  });

  const { data: aptitudes = [] } = useQuery({
    queryKey: ['aptitudes-for-form'],
    queryFn: getAllAptitudesForForm,
    staleTime: 5 * 60 * 1000,
  });

  // ── Aptitudes (M:M): baseline leído del servidor al abrir el form ───────────
  // La selección es `null` hasta que el usuario toca el combo; mientras tanto se muestra el baseline.
  const [aptitudeSelection, setAptitudeSelection] = useState<string[] | null>(null);
  const baselineQuery = useQuery({
    queryKey: ['position-aptitude-ids', selectedPosition?.id],
    queryFn: () => getPositionAptitudeIds(selectedPosition!.id),
    enabled: isEditing,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const baseline = useMemo(() => (isEditing ? baselineQuery.data ?? null : []), [isEditing, baselineQuery.data]);
  const baselineReady = baseline !== null;
  const selectedAptitudes = aptitudeSelection ?? baseline ?? [];
  const aptitudeDelta = useMemo(() => {
    const base = baseline ?? [];
    return {
      add: selectedAptitudes.filter((id) => !base.includes(id)),
      remove: base.filter((id) => !selectedAptitudes.includes(id)),
    };
  }, [baseline, selectedAptitudes]);

  // ── Formulario ────────────────────────────────────────────────────────────
  const form = useForm<PositionFormValues>({
    resolver: zodResolver(PositionSchema),
    defaultValues: {
      name: '',
      is_active: true,
      hierarchical_position_id: [],
    },
  });

  // Sincronizar form cuando cambia la posición seleccionada para editar
  useEffect(() => {
    if (selectedPosition) {
      form.reset({
        name: selectedPosition.name ?? '',
        is_active: selectedPosition.is_active ?? true,
        hierarchical_position_id: selectedPosition.hierarchical_position_id ?? [],
      });
    } else {
      form.reset({
        name: '',
        is_active: true,
        hierarchical_position_id: [],
      });
    }
    setAptitudeSelection(null);
  }, [selectedPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dependency modal config ───────────────────────────────────────────────
  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'company_positions',
        sourceColumn: 'name',
        targetTable: 'employees',
        targetColumn: 'company_position',
        displayColumns: ['lastname', 'firstname', 'cuil', 'file'],
        displayLabels: ['Apellido', 'Nombre', 'Documento', 'Legajo'],
        relationName: 'Empleados',
      },
    ],
    []
  );

  const fetchDependencies = async (config: DependencyConfig, recordKeyValue: string) => {
    const select = config.displayColumns.join(',') as '*';
    return fetchDependenciesForValue<'employees', 'company_position'>({
      targetTable: 'employees',
      targetColumn: 'company_position',
      value: recordKeyValue,
      select,
      limit: 10,
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const persistUpdate = async (values: PositionFormValues) => {
    if (!selectedPosition) return;
    const result = await updatePositionPrisma({
      id: selectedPosition.id,
      name: values.name,
      is_active: values.is_active,
      hierarchical_position_id: values.hierarchical_position_id ?? [],
      aptitudes: aptitudeDelta,
    });
    toast.success(`Posición actualizada. Aptitudes: ${result.added} agregadas, ${result.removed} quitadas.`);
    await queryClient.invalidateQueries({ queryKey: ['positions'] });
    form.reset();
    onDone();
  };

  const handleSubmit = async (values: PositionFormValues) => {
    if (isEditing && !baselineReady) return;
    setBusy(true);
    try {
      if (!isEditing) {
        await createPositionPrisma({
          name: values.name,
          is_active: values.is_active,
          hierarchical_position_id: values.hierarchical_position_id ?? [],
          aptitudes_tecnicas_id: selectedAptitudes,
        });
        toast.success('Posición creada con éxito');
      } else {
        const prevActive = !!selectedPosition.is_active;
        const nextActive = values.is_active;

        // Si se intenta desactivar, verificar dependencias primero
        if (prevActive && !nextActive) {
          const data = await fetchDependencies(dependencyConfigs[0], selectedPosition.id);
          if (data.data.length > 0) {
            setBusy(false);
            setShowDependencyModal(true);
            return; // El modal decidirá
          }
        }

        await persistUpdate(values);
        return;
      }

      // Invalidar queries para refrescar la tabla
      await queryClient.invalidateQueries({ queryKey: ['positions'] });

      form.reset();
      onDone();
    } catch (error) {
      logger.error('Error al guardar la posición', { data: { error } });
      setBusy(false);
      toast.error('Error al guardar la posición');
    }
  };

  // ── Dependency modal handler ──────────────────────────────────────────────
  const handleDependencyConfirm = (action: 'force' | 'replace', replacementValue?: string): void => {
    void handleDependencyConfirmAsync(action, replacementValue);
  };

  const handleDependencyConfirmAsync = async (action: 'force' | 'replace', replacementValue?: string) => {
    setShowDependencyModal(false);
    if (!selectedPosition?.id) return;

    setBusy(true);
    try {
      // 'replace': reasigna los empleados al puesto elegido (o los deja sin puesto) y recién después desactiva.
      // 'force': desactiva sin reasignar.
      if (action === 'replace') {
        await reassignDependencies({
          targetTable: 'employees',
          targetColumn: dependencyConfigs[0].targetColumn,
          sourceTable: 'company_positions',
          fromValue: selectedPosition.id,
          toValue: replacementValue && replacementValue !== '__NULL__' ? replacementValue : null,
        });
      }
      await persistUpdate(form.getValues());
    } catch (error) {
      logger.error('Error al desactivar la posición', { data: { error, action } });
      setBusy(false);
      toast.error(action === 'replace' ? 'No se pudieron reemplazar las referencias' : 'Error al guardar la posición');
    }
  };

  const handleCancel = () => {
    form.reset();
    onDone();
  };

  // ── Formatted options ─────────────────────────────────────────────────────
  const hierarchyOptions = useMemo(() => hierarchies.map((h) => ({ label: h.name, value: h.id })), [hierarchies]);

  const aptitudeOptions = useMemo(() => aptitudes.map((apt) => ({ label: apt.nombre, value: apt.id })), [aptitudes]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Puesto</FormLabel>
                <FormControl>
                  <Input type="text" {...field} placeholder="Nombre del puesto" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hierarchical_position_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sector/Departamento</FormLabel>
                <FormControl>
                  <MultiSelectCombobox
                    options={hierarchyOptions}
                    emptyMessage="No hay sectores disponibles"
                    selectedValues={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Seleccione Sectores"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Label>Aptitudes Técnicas</Label>
            <MultiSelectCombobox
              options={aptitudeOptions}
              emptyMessage="No hay aptitudes disponibles"
              selectedValues={selectedAptitudes}
              onChange={setAptitudeSelection}
              placeholder={baselineReady ? 'Seleccione Aptitudes' : 'Cargando aptitudes del puesto...'}
              disabled={!baselineReady}
            />
            {baselineQuery.isError && (
              <p role="alert" className="text-sm text-danger">
                No se pudieron cargar las aptitudes actuales del puesto; no se puede guardar.
              </p>
            )}
            {isEditing && baselineReady && (
              <p role="status" className="text-sm text-muted-foreground tabular-nums">
                {baseline?.length ?? 0} {(baseline?.length ?? 0) === 1 ? 'aptitud actual' : 'aptitudes actuales'}. Se
                agregan {aptitudeDelta.add.length}.{' '}
                <span className={aptitudeDelta.remove.length > 0 ? 'text-danger' : undefined}>
                  Se quitan {aptitudeDelta.remove.length}.
                </span>
              </p>
            )}
          </div>

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
            <Button
              variant="brand"
              type="submit"
              disabled={form.formState.isSubmitting || (isEditing && !baselineReady)}
            >
              {form.formState.isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
            </Button>
            <Button type="button" onClick={handleCancel} variant="outline">
              Cancelar
            </Button>
          </div>
        </form>
      </Form>

      {/* Modal de validación de dependencias */}
      {isEditing && selectedPosition && (
        <DependencyValidationModal
          isOpen={showDependencyModal}
          onClose={() => setShowDependencyModal(false)}
          onConfirm={handleDependencyConfirm}
          recordId={selectedPosition.id}
          recordName={selectedPosition.name ?? ''}
          dependencies={dependencyConfigs}
          title="Confirmar desactivación"
          description="Esta posición está siendo utilizada por otros registros. Debe resolver estas referencias antes de desactivarla."
          fetchDependencies={fetchDependencies}
          fetchReplacementOptions={fetchReplacementOptions}
        />
      )}
    </>
  );
}
