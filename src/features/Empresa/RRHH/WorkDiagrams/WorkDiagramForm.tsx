'use client';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import DependencyValidationModal, { DependencyConfig } from '@/shared/components/modal/DependencyValidationModal';
import {
  fetchDependenciesForValue,
  fetchReplacementOptions,
  reassignDependencies,
} from '@/shared/components/modal/dependency-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import {
  createWorkDiagramPrisma,
  getWorkDiagramActiveNoveltyIds,
  updateWorkDiagramPrisma,
  type DiagramTypeItem,
  type WorkDiagramListItem,
} from './actions.server';

const logger = new Logger('features/Empresa/RRHH');
// Actualizar el esquema para eliminar el campo days
const WorkDiagramSchema = z.object({
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters.',
  }),
  is_active: z.boolean(),
  active_working_days: z.number().int().min(0, {
    message: 'Active days must be a positive number.',
  }),
  inactive_working_days: z.number().int().min(0, {
    message: 'Inactive days must be a positive number.',
  }),
  inactive_novelty: z.string().optional(),
});

type WorkDiagramFormValues = z.infer<typeof WorkDiagramSchema>;

interface WorkDiagramFormProps {
  diagram?: WorkDiagramListItem | null;
  mode: 'create' | 'edit';
  diagramsTypes?: DiagramTypeItem[] | null;
  setMode: (mode: 'create' | 'edit') => void;
}

export default function WorkDiagramForm({ diagramsTypes, diagram, mode, setMode }: WorkDiagramFormProps) {
  const [showDependencyModal, setShowDependencyModal] = useState(false);

  // Configuración reutilizable para validar dependencias de types_of_contract
  const dependencyConfigs = useMemo<DependencyConfig[]>(
    () => [
      {
        sourceTable: 'work_diagram',
        sourceColumn: 'name',

        targetTable: 'employees',
        targetColumn: 'workflow_diagram',

        displayColumns: ['lastname', 'firstname', 'cuil', 'file'],
        displayLabels: ['Apellido', 'Nombre', 'Documento', 'Legajo'],
        relationName: 'Empleados',
      },
    ],
    []
  );

  const form = useForm<WorkDiagramFormValues>({
    resolver: zodResolver(WorkDiagramSchema),
    defaultValues: {
      name: diagram?.name || '',
      is_active: diagram?.is_active ?? true,
      active_working_days: diagram?.active_working_days || 0,
      inactive_working_days: diagram?.inactive_working_days || 0,
      inactive_novelty: diagram?.inactive_novelty ?? '',
    },
  });
  const { reset } = form;

  // ── Novedades activas (M:M): baseline leído del servidor al abrir el form ───
  // La selección es `null` hasta que el usuario toca el combo; mientras tanto se muestra el baseline.
  const [noveltySelection, setNoveltySelection] = useState<string[] | null>(null);
  const isEditMode = mode === 'edit' && !!diagram;
  const baselineQuery = useQuery({
    queryKey: ['work-diagram-active-novelty-ids', diagram?.id],
    queryFn: () => getWorkDiagramActiveNoveltyIds(diagram!.id),
    enabled: isEditMode,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const baseline = useMemo(() => (isEditMode ? baselineQuery.data ?? null : []), [isEditMode, baselineQuery.data]);
  const baselineReady = baseline !== null;
  const selectedNovelties = noveltySelection ?? baseline ?? [];
  const noveltyDelta = useMemo(() => {
    const base = baseline ?? [];
    return {
      add: selectedNovelties.filter((id) => !base.includes(id)),
      remove: base.filter((id) => !selectedNovelties.includes(id)),
    };
  }, [baseline, selectedNovelties]);
  const router = useRouter();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();
  const fixedOptions =
    diagramsTypes
      ?.filter((opt) => opt.work_active)
      .map((opt) => ({
        value: opt.id,
        label: opt.name ?? 'Sin nombre',
      })) || [];

  // Función de fetch que usará el Modal (tipado genérico reutilizable basado en la utilidad)
  const fetchDependencies = async (config: DependencyConfig, recordKeyValue: string) => {
    // Solicitamos solo las columnas que se van a mostrar
    const select = config.displayColumns.join(',') as '*';

    const data = await fetchDependenciesForValue<'employees', 'workflow_diagram'>({
      targetTable: 'employees',
      targetColumn: 'workflow_diagram',
      value: recordKeyValue,
      select,
      limit: 10,
    });

    return data;
  };

  const handleDependencyConfirm = (action: 'force' | 'replace', replacementValue?: string): void => {
    void handleDependencyConfirmAsync(action, replacementValue);
  };

  const handleDependencyConfirmAsync = async (action: 'force' | 'replace', replacementValue?: string) => {
    setShowDependencyModal(false);

    if (!diagram) return;

    setBusy(true);
    // 'force': solo desactivar el registro, sin reasignar los empleados.
    if (action === 'force') {
      performUpdate(form.getValues());
      return;
    }

    // 'replace': reasignar los empleados y recién después desactivar el registro.
    try {
      await reassignDependencies({
        targetTable: 'employees',
        targetColumn: dependencyConfigs[0].targetColumn,
        sourceTable: 'work_diagram',
        fromValue: diagram.id,
        toValue: replacementValue && replacementValue !== '__NULL__' ? replacementValue : null,
      });
      performUpdate(form.getValues());
    } catch (err) {
      logger.error('Error al reemplazar referencias', { data: { error: err } });
      setBusy(false);
      toast.error('No se pudieron reemplazar las referencias');
    }
  };

  useEffect(() => {
    if (diagram) {
      form.reset({
        name: diagram.name ?? '',
        is_active: diagram.is_active ?? true,
        active_working_days: diagram.active_working_days ?? 0,
        inactive_working_days: diagram.inactive_working_days ?? 0,
        inactive_novelty: diagram.inactive_novelty ?? '',
      });
    }
    setNoveltySelection(null);
  }, [diagram]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (values: z.infer<typeof WorkDiagramSchema>) => {
    setBusy(true);
    toast.promise(
      async () => {
        await createWorkDiagramPrisma({
          name: values.name,
          is_active: values.is_active,
          active_working_days: values.active_working_days,
          inactive_working_days: values.inactive_working_days,
          active_novelty: selectedNovelties,
          inactive_novelty: values.inactive_novelty || '',
        });
      },
      {
        loading: 'Creando diagrama...',
        success: () => {
          reset();
          closeSheet();
          router.refresh();
          return 'Diagrama creado correctamente';
        },
        error: () => {
          setBusy(false);
          return 'Error al crear el diagrama';
        },
      }
    );
  };
  const performUpdate = (values: z.infer<typeof WorkDiagramSchema>) => {
    if (!diagram?.id) {
      setBusy(false);
      toast.error('No se encontró el diagrama a actualizar');
      return;
    }
    setBusy(true);
    toast.promise(
      updateWorkDiagramPrisma({
        id: diagram.id,
        name: values.name,
        is_active: values.is_active,
        active_working_days: values.active_working_days,
        inactive_working_days: values.inactive_working_days,
        active_novelty: noveltyDelta,
        inactive_novelty: values.inactive_novelty || '',
      }),
      {
        loading: 'Actualizando diagrama...',
        success: (result) => {
          reset();
          setNoveltySelection(null);
          closeSheet();
          router.refresh();
          return `Diagrama actualizado. Novedades activas: ${result.added} agregadas, ${result.removed} quitadas.`;
        },
        error: () => {
          setBusy(false);
          return 'Error al actualizar el diagrama';
        },
      }
    );
  };

  const onUpdate = async (values: z.infer<typeof WorkDiagramSchema>) => {
    if (!diagram || !baselineReady) return;
    // Si se intenta pasar a inactivo, verificar dependencias antes de escribir.
    if (diagram.is_active && !values.is_active) {
      setBusy(true);
      try {
        const data = await fetchDependencies(dependencyConfigs[0], diagram.id);
        if (data.data.length) {
          setBusy(false);
          setShowDependencyModal(true);
          return; // El modal decide: reasignar o forzar.
        }
      } catch (err) {
        logger.error('Error al verificar dependencias del diagrama', { data: { error: err } });
        setBusy(false);
        toast.error('No se pudo verificar si el diagrama está en uso');
        return;
      }
    }
    performUpdate(values);
  };
  const onCancel = () => {
    form.reset({
      name: '',
      is_active: false,
      active_working_days: 0,
      inactive_working_days: 0,
      inactive_novelty: '',
    });
    setNoveltySelection(null);
    setMode('create');
  };

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(mode === 'edit' ? onUpdate : onSubmit)} className="space-y-4">
          {/* Nombre */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del diagrama</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre del diagrama" {...field} />
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
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value ? 'true' : 'false'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Días activos + inactivos en grid */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="active_working_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Días activos</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="inactive_working_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Días inactivos</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Novedad activa (multi-select) */}
          <div className="space-y-2">
            <Label>Novedad activa</Label>
            <MultiSelectCombobox
              options={fixedOptions}
              selectedValues={selectedNovelties}
              onChange={setNoveltySelection}
              placeholder={baselineReady ? 'Seleccionar novedades' : 'Cargando novedades del diagrama...'}
              emptyMessage="No hay novedades disponibles"
              disabled={!baselineReady}
            />
            {baselineQuery.isError && (
              <p role="alert" className="text-sm text-danger">
                No se pudieron cargar las novedades actuales del diagrama; no se puede guardar.
              </p>
            )}
            {isEditMode && baselineReady && (
              <p role="status" className="text-sm text-muted-foreground tabular-nums">
                {baseline?.length ?? 0} {(baseline?.length ?? 0) === 1 ? 'novedad actual' : 'novedades actuales'}. Se
                agregan {noveltyDelta.add.length}.{' '}
                <span className={noveltyDelta.remove.length > 0 ? 'text-danger' : undefined}>
                  Se quitan {noveltyDelta.remove.length}.
                </span>
              </p>
            )}
          </div>

          {/* Novedad inactiva (select simple) */}
          <FormField
            control={form.control}
            name="inactive_novelty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Novedad inactiva</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar novedad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Novedad</SelectLabel>
                        {diagramsTypes
                          ?.filter((diagramType) => !diagramType.work_active)
                          .map((diagramType) => (
                            <SelectItem key={diagramType.id} value={diagramType.id}>
                              {diagramType.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-2 mt-6">
            <Button
              type="submit"
              variant="brand"
              disabled={form.formState.isSubmitting || (mode === 'edit' && !baselineReady)}
            >
              {form.formState.isSubmitting
                ? mode === 'edit'
                  ? 'Actualizando...'
                  : 'Creando...'
                : mode === 'edit'
                  ? 'Actualizar'
                  : 'Crear'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>

        {/* Modal de validación de dependencias reutilizable */}
        {mode === 'edit' && diagram && (
          <DependencyValidationModal
            isOpen={showDependencyModal}
            onClose={() => setShowDependencyModal(false)}
            onConfirm={handleDependencyConfirm}
            recordId={diagram.id || ''}
            recordName={diagram.name || ''}
            dependencies={dependencyConfigs}
            title="Confirmar desactivación"
            description="Este diagrama de trabajo está siendo utilizado por otros registros. Debe resolver estas referencias antes de desactivarlo."
            fetchDependencies={fetchDependencies}
            fetchReplacementOptions={fetchReplacementOptions}
          />
        )}
      </Form>
    </div>
  );
}
