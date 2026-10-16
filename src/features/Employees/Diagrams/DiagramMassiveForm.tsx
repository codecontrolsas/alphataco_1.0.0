'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CalendarRange, Sparkles } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { checkMassiveConflicts } from './actions/diagram-massive-actions';
import { MASSIVE_MAX_EMPLOYEES, MASSIVE_MAX_RANGES, MASSIVE_MAX_TOTAL_DAYS } from './lib/massive-limits';
import { dateToIsoDay, inclusiveDays, isoDayToDate } from './lib/massive-ranges';
import { ConflictReviewSheet } from './load/components/ConflictReviewSheet';
import { DateRangeList } from './load/components/DateRangeList';
import { EmployeeChips } from './load/components/EmployeeChips';
import { LoadModeSelector, type LoadModeOption } from './load/components/LoadModeSelector';
import { LoadPreview } from './load/components/LoadPreview';
import { LoadSection } from './load/components/LoadSection';
import { NoveltyBadge, NoveltyDot } from './load/components/NoveltyBadge';
import { NoveltySelect } from './load/components/NoveltySelect';
import { useMassiveLoadCatalogs } from './load/hooks';
import {
  massiveLoadFormSchema,
  type EmployeeOption,
  type MassiveLoadFormValues,
  type MassiveLoadParams,
} from './load/schemas';
import type { ConflictCheckResult, MassiveMode, ProcessingResult } from './types/massive-diagram';

const logger = new Logger('Diagrams/DiagramMassiveForm');

const MODE_OPTIONS: readonly LoadModeOption<MassiveMode>[] = [
  {
    value: 'diagram',
    title: 'Diagrama de trabajo',
    description: `Aplica un patrón cíclico (días activos e inactivos) a hasta ${MASSIVE_MAX_EMPLOYEES} empleados durante un rango.`,
    icon: CalendarRange,
  },
  {
    value: 'novelty',
    title: 'Una novedad',
    description: `Asigna la misma novedad (feriado, licencia…) a hasta ${MASSIVE_MAX_EMPLOYEES} empleados en todos los días elegidos.`,
    icon: Sparkles,
  },
];

interface PendingReview {
  params: MassiveLoadParams;
  check: ConflictCheckResult;
  labels: Record<string, string>;
}

interface DiagramMassiveFormProps {
  /** Se llama al terminar el procesamiento, con los nombres con legajo de los empleados de la carga. */
  onCompleted: (result: ProcessingResult, labels: Record<string, string>) => void;
}

function buildParams(data: MassiveLoadFormValues): MassiveLoadParams {
  const base = {
    employeeIds: data.employees.map((employee) => employee.id),
    ranges: data.dateRanges.map((range) => ({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) })),
  };
  return data.mode === 'diagram'
    ? {
        ...base,
        mode: 'diagram',
        workDiagramId: data.workDiagramId,
        activeNoveltyId: data.activeNoveltyId || undefined,
      }
    : { ...base, mode: 'novelty', diagramTypeId: data.diagramTypeId };
}

/** Formulario único de la carga masiva: qué cargar, con qué novedad o diagrama, en qué fechas y para quiénes. */
export function DiagramMassiveForm({ onCompleted }: DiagramMassiveFormProps) {
  // Procesar la carga masiva exige `massive_diagram:create`; con solo `view` se ve el formulario pero no se puede enviar.
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('empleados', 'massive_diagram', 'create');
  const [review, setReview] = useState<PendingReview | null>(null);

  const catalogsQuery = useMassiveLoadCatalogs();
  const catalogs = catalogsQuery.data;

  // Hoy en hora argentina, como fecha local a medianoche (lo que devuelve el calendario).
  const today = isoDayToDate(argentinaDate());

  const form = useForm<MassiveLoadFormValues>({
    resolver: zodResolver(massiveLoadFormSchema),
    defaultValues: {
      mode: 'diagram',
      employees: [],
      workDiagramId: '',
      activeNoveltyId: '',
      diagramTypeId: '',
      dateRanges: [{ from: today, to: moment(today).add(7, 'days').toDate() }],
    },
  });

  const mode = form.watch('mode');
  const workDiagramId = form.watch('workDiagramId');
  const employees = form.watch('employees');
  const dateRanges = form.watch('dateRanges');

  const workDiagrams = catalogs?.workDiagrams ?? [];
  const selectedWorkDiagram = workDiagrams.find((workDiagram) => workDiagram.id === workDiagramId);
  const dayCount = dateRanges.reduce(
    (sum, range) => sum + inclusiveDays({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) }),
    0
  );

  const checkMutation = useMutation({
    mutationFn: (params: MassiveLoadParams) => checkMassiveConflicts(params),
    onError: (error: Error) => {
      logger.error('Error al verificar los conflictos', { data: { error } });
      toast.error(error.message || 'No se pudieron verificar los conflictos. Volvé a intentar.');
    },
  });

  const handleSubmit = (data: MassiveLoadFormValues) => {
    const params = buildParams(data);
    const labels = Object.fromEntries(data.employees.map((employee) => [employee.id, employee.label]));
    checkMutation.mutate(params, { onSuccess: (check) => setReview({ params, check, labels }) });
  };

  const handleModeChange = (nextMode: MassiveMode) => {
    form.setValue('mode', nextMode);
    // Los campos del otro modo no deben arrastrar valores ni errores.
    form.setValue('workDiagramId', '');
    form.setValue('activeNoveltyId', '');
    form.setValue('diagramTypeId', '');
    form.clearErrors(['workDiagramId', 'activeNoveltyId', 'diagramTypeId']);
    // El diagrama de trabajo admite un solo rango: el ciclo se cuenta desde su primer día.
    if (nextMode === 'diagram' && form.getValues('dateRanges').length > 1) {
      form.setValue('dateRanges', [form.getValues('dateRanges')[0]]);
    }
  };

  const handleWorkDiagramChange = (id: string) => {
    form.setValue('workDiagramId', id, { shouldValidate: form.formState.isSubmitted });
    // Igual que el servidor: si no se elige otra, se usa la primera novedad activa configurada.
    const firstActive = workDiagrams.find((workDiagram) => workDiagram.id === id)?.activeNovelties[0];
    form.setValue('activeNoveltyId', firstActive?.id ?? '', { shouldValidate: form.formState.isSubmitted });
  };

  const handleEmployeesChange = (selected: EmployeeOption[]) => {
    form.setValue('employees', selected, { shouldValidate: form.formState.isSubmitted });
  };

  if (catalogsQuery.isError) {
    return (
      <StateBlock
        variant="error"
        title="No se pudieron cargar los diagramas y las novedades"
        description="Revisá la conexión e intentá de nuevo."
        action={
          <Button type="button" variant="outline" onClick={() => catalogsQuery.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex max-w-3xl flex-col gap-8" noValidate>
          <LoadSection step={1} title="Qué se carga">
            <LoadModeSelector
              value={mode}
              onChange={handleModeChange}
              options={MODE_OPTIONS}
              ariaLabel="Tipo de carga masiva"
            />
          </LoadSection>

          <LoadSection
            step={2}
            title={mode === 'diagram' ? 'Diagrama de trabajo' : 'Novedad a aplicar'}
            description={
              mode === 'diagram'
                ? 'Los días activos e inactivos se alternan desde el primer día del rango.'
                : 'Se carga la misma novedad en cada día de los rangos.'
            }
          >
            {mode === 'diagram' ? (
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="workDiagramId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diagrama de trabajo</FormLabel>
                      {catalogsQuery.isPending ? (
                        <Skeleton className="h-10 w-full" />
                      ) : (
                        <Select value={field.value} onValueChange={handleWorkDiagramChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Elegí un diagrama de trabajo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {workDiagrams.map((workDiagram) => (
                              <SelectItem key={workDiagram.id} value={workDiagram.id}>
                                {workDiagram.name}
                                {workDiagram.activeDays != null && workDiagram.inactiveDays != null ? (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    ({workDiagram.activeDays}x{workDiagram.inactiveDays})
                                  </span>
                                ) : null}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedWorkDiagram && selectedWorkDiagram.activeNovelties.length > 1 ? (
                  <FormField
                    control={form.control}
                    name="activeNoveltyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Novedad de los días activos</FormLabel>
                        <NoveltySelect
                          options={selectedWorkDiagram.activeNovelties}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Elegí la novedad de los días activos"
                          ariaLabel="Novedad de los días activos"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                {selectedWorkDiagram ? (
                  <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    {selectedWorkDiagram.activeNovelties.length === 1 ? (
                      <div className="flex items-center gap-2">
                        <dt className="text-muted-foreground">Días activos:</dt>
                        <dd>
                          <NoveltyBadge
                            name={selectedWorkDiagram.activeNovelties[0].name}
                            color={selectedWorkDiagram.activeNovelties[0].color}
                          />
                        </dd>
                      </div>
                    ) : null}
                    {selectedWorkDiagram.inactiveNovelty ? (
                      <div className="flex items-center gap-2">
                        <dt className="text-muted-foreground">Días inactivos:</dt>
                        <dd className="flex items-center gap-1.5">
                          <NoveltyDot color={selectedWorkDiagram.inactiveNovelty.color} />
                          {selectedWorkDiagram.inactiveNovelty.name}
                        </dd>
                      </div>
                    ) : null}
                    {selectedWorkDiagram.activeNovelties.length === 0 ? (
                      <p role="alert" className="text-destructive">
                        Este diagrama no tiene una novedad activa configurada.
                      </p>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="diagramTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Novedad</FormLabel>
                    <NoveltySelect
                      options={catalogs?.diagramTypes ?? []}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Elegí una novedad"
                      isLoading={catalogsQuery.isPending}
                      ariaLabel="Novedad"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </LoadSection>

          <LoadSection
            step={3}
            title={mode === 'diagram' ? 'Rango de fechas' : 'Rangos de fechas'}
            description="Desde hoy en adelante."
          >
            <DateRangeList
              maxRanges={mode === 'diagram' ? 1 : MASSIVE_MAX_RANGES}
              maxTotalDays={MASSIVE_MAX_TOTAL_DAYS}
              minDate={today}
            />
          </LoadSection>

          <LoadSection step={4} title="Empleados" description={`Hasta ${MASSIVE_MAX_EMPLOYEES} por carga.`}>
            <FormField
              control={form.control}
              name="employees"
              render={({ fieldState }) => (
                <FormItem>
                  <EmployeeChips
                    value={employees}
                    onChange={handleEmployeesChange}
                    max={MASSIVE_MAX_EMPLOYEES}
                    invalid={Boolean(fieldState.error)}
                    withFilters
                    workflowOptions={workDiagrams.map((workDiagram) => ({
                      value: workDiagram.id,
                      label: workDiagram.name,
                    }))}
                    defaultWorkflowId={mode === 'diagram' && workDiagramId ? workDiagramId : undefined}
                    ariaLabel="Empleados de la carga"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </LoadSection>

          <LoadPreview employeeCount={employees.length} dayCount={dayCount} />

          {canCreate ? (
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto sm:self-start"
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? 'Verificando…' : 'Revisar y confirmar'}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">No tenés permiso para realizar cargas masivas.</p>
          )}
        </form>
      </Form>

      {review ? (
        <ConflictReviewSheet
          open
          onOpenChange={(open) => {
            if (!open) setReview(null);
          }}
          params={review.params}
          check={review.check}
          employeeLabels={review.labels}
          onProcessed={(result) => {
            setReview(null);
            onCompleted(result, review.labels);
          }}
        />
      ) : null}
    </>
  );
}
