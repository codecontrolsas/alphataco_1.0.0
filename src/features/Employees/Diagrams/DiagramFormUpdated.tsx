'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CreateDiagrams,
  UpdateDiagramsById,
  type DiagramInsert,
  type DiagramUpdate,
} from '@/features/Employees/Diagrams/actions/mutations.server';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { INDIVIDUAL_MAX_TOTAL_DAYS, MASSIVE_MAX_RANGES } from './lib/massive-limits';
import { dateToIsoDay, expandIsoRanges, isoDayToDate } from './lib/massive-ranges';
import { getEmployeeDiagramsInRanges } from './load/actions.server';
import { DateRangeList } from './load/components/DateRangeList';
import { EmployeeChips } from './load/components/EmployeeChips';
import { IndividualReview } from './load/components/IndividualReview';
import { LoadPreview } from './load/components/LoadPreview';
import { LoadResultPanel, type LoadTotals } from './load/components/LoadResultPanel';
import { LoadSection } from './load/components/LoadSection';
import { NoveltySelect } from './load/components/NoveltySelect';
import { useCalendarHref, useLoadEmployee, useRefreshDiagramViews } from './load/hooks';
import { buildReviewDays, buildWritePayload } from './load/lib/individual-review';
import {
  individualLoadSchema,
  type EmployeeOption,
  type IndividualLoadValues,
  type IndividualReviewValues,
} from './load/schemas';

const logger = new Logger('Diagrams/DiagramFormUpdated');

/** Atajos de la carga individual: arrancan hoy; «Solo hoy» es el caso más común. */
const INDIVIDUAL_PRESETS = [
  { label: 'Solo hoy', days: 1 },
  { label: '7 días', days: 7 },
  { label: '14 días', days: 14 },
  { label: '30 días', days: 30 },
];

/** Lo mínimo que necesita el selector de novedad: sirve tanto la fila completa como `{ id, name }`. */
type DiagramTypeOption = { id: string; name: string | null; color?: string | null; short_description?: string | null };

interface ReviewStage {
  kind: 'review';
  days: IndividualReviewValues['days'];
  employee: EmployeeOption;
  novelty: { id: string; name: string | null; color: string | null };
  comments: string;
  customizeComments: boolean;
}

interface ResultStage {
  kind: 'result';
  totals: LoadTotals;
  employee: EmployeeOption;
  notCreated: number;
}

type Stage = { kind: 'form' } | ReviewStage | ResultStage;

function emptyValues(defaultId: string | undefined): IndividualLoadValues {
  const today = isoDayToDate(argentinaDate());
  return {
    // En el detalle del empleado el empleado viene fijo; su etiqueta se resuelve aparte.
    employees: defaultId ? [{ id: defaultId, label: '' }] : [],
    diagramTypeId: '',
    dateRanges: [{ from: today, to: today }],
    comments: '',
    customizeComments: false,
  };
}

/**
 * Carga individual: un empleado, una novedad y uno o más rangos. Primero se completa el formulario, después se
 * revisa día por día (crear, reemplazar, conservar u omitir) y al confirmar se escribe en lote.
 * También se embebe en el detalle del empleado (`defaultId`), donde el empleado va fijo.
 */
function DiagramFormUpdated({
  diagrams_types,
  defaultId,
}: {
  diagrams_types: DiagramTypeOption[];
  defaultId?: string;
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const calendarHref = useCalendarHref();
  const refreshDiagramViews = useRefreshDiagramViews();
  // Mismas reglas que el servidor (`CreateDiagrams` / `UpdateDiagramsById`): crear = `new:create`, editar = `new:update`;
  // `employees:update` habilita ambas porque el formulario también se embebe en el detalle del empleado.
  const { hasPermission } = usePermissions();
  const canEditEmployee = hasPermission('empleados', 'employees', 'update');
  const canCreate = hasPermission('empleados', 'new', 'create') || canEditEmployee;
  const canUpdate = hasPermission('empleados', 'new', 'update') || canEditEmployee;

  const fixedEmployeeQuery = useLoadEmployee(defaultId);

  const form = useForm<IndividualLoadValues>({
    resolver: zodResolver(individualLoadSchema),
    defaultValues: emptyValues(defaultId),
  });

  const employees = form.watch('employees');
  const customizeComments = form.watch('customizeComments');
  const dateRanges = form.watch('dateRanges');

  const fixedEmployee: EmployeeOption | null = defaultId
    ? { id: defaultId, label: fixedEmployeeQuery.data?.label ?? 'Cargando empleado…' }
    : null;
  const dayCount = expandIsoRanges(
    dateRanges.map((range) => ({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) }))
  ).length;

  const checkMutation = useMutation({
    mutationFn: getEmployeeDiagramsInRanges,
    onError: (error: Error) => {
      logger.error('Error al consultar las novedades del empleado', { data: { error } });
      toast.error(error.message || 'No se pudieron consultar las novedades. Volvé a intentar.');
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (input: { creates: DiagramInsert[]; updates: DiagramUpdate[] }) => {
      // Las dos escrituras son lotes (un `createMany` y un `updateMany` por grupo), cada una en su transacción.
      const created = input.creates.length > 0 ? await CreateDiagrams(input.creates) : null;
      try {
        const updated = input.updates.length > 0 ? await UpdateDiagramsById(input.updates) : null;
        return { created, updated };
      } catch (error) {
        if (created) {
          refreshDiagramViews();
          const reason = error instanceof Error && error.message ? error.message : 'error desconocido';
          throw new Error(`Se crearon ${created.count} días, pero no se pudieron reemplazar los existentes: ${reason}`);
        }
        throw error;
      }
    },
    onError: (error: Error) => {
      logger.error('Error al guardar las novedades', { data: { error } });
      toast.error(error.message || 'No se pudieron guardar las novedades. Volvé a intentar.');
    },
  });

  const handleCheck = (data: IndividualLoadValues) => {
    const employee: EmployeeOption = defaultId
      ? { id: defaultId, label: fixedEmployeeQuery.data?.label ?? defaultId }
      : data.employees[0];
    const ranges = data.dateRanges.map((range) => ({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) }));
    const novelty = diagrams_types.find((type) => type.id === data.diagramTypeId);

    checkMutation.mutate(
      { employeeId: employee.id, ranges },
      {
        onSuccess: (existing) => {
          setStage({
            kind: 'review',
            days: buildReviewDays({ ranges, existing, canCreate, generalComment: data.comments.trim() }),
            employee,
            novelty: { id: data.diagramTypeId, name: novelty?.name ?? null, color: novelty?.color ?? null },
            comments: data.comments.trim(),
            customizeComments: data.customizeComments,
          });
        },
      }
    );
  };

  const handleConfirm = (review: ReviewStage, days: IndividualReviewValues['days']) => {
    const payload = buildWritePayload({
      days,
      employeeId: review.employee.id,
      diagramTypeId: review.novelty.id,
      generalComment: review.comments,
      customizeComments: review.customizeComments,
    });

    applyMutation.mutate(payload, {
      onSuccess: ({ created, updated }) => {
        refreshDiagramViews();
        // Los días que ya tenían registro se omiten al crear (`skipDuplicates`): se informa lo que se creó de verdad.
        const notCreated = (created?.requested ?? 0) - (created?.count ?? 0);
        const notReplaced = (updated?.requested ?? 0) - (updated?.count ?? 0);
        const totals: LoadTotals = {
          created: created?.count ?? 0,
          replaced: updated?.count ?? 0,
          skipped: payload.untouched + notCreated + notReplaced,
          errors: 0,
        };
        toast.success(`Se cargaron ${totals.created + totals.replaced} novedades`);
        setStage({ kind: 'result', totals, employee: review.employee, notCreated });
      },
    });
  };

  const handleReset = () => {
    form.reset(emptyValues(defaultId));
    setStage({ kind: 'form' });
  };

  if (stage.kind === 'result') {
    return (
      <div className="min-w-0">
        <LoadResultPanel
          totals={stage.totals}
          description={`Empleado: ${stage.employee.label}`}
          onReset={handleReset}
          // Dentro del detalle del empleado el calendario general no es el destino.
          calendarHref={defaultId ? undefined : calendarHref}
        >
          {stage.notCreated > 0 ? (
            <p role="status" className="bg-warn-subtle text-warn-subtle-foreground rounded-lg border px-4 py-3 text-sm">
              {stage.notCreated} {stage.notCreated === 1 ? 'día ya tenía' : 'días ya tenían'} una novedad cargada por
              otra persona mientras revisabas, así que no {stage.notCreated === 1 ? 'se creó' : 'se crearon'}.
            </p>
          ) : null}
        </LoadResultPanel>
      </div>
    );
  }

  if (stage.kind === 'review') {
    return (
      <div className="min-w-0">
        <IndividualReview
          days={stage.days}
          employeeLabel={stage.employee.label}
          novelty={stage.novelty}
          customizeComments={stage.customizeComments}
          canCreate={canCreate}
          canUpdate={canUpdate}
          isSubmitting={applyMutation.isPending}
          onBack={() => setStage({ kind: 'form' })}
          onConfirm={(days) => handleConfirm(stage, days)}
        />
      </div>
    );
  }

  const canSubmit = canCreate || canUpdate;

  return (
    <div className="min-w-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleCheck)} className="flex max-w-3xl flex-col gap-8" noValidate>
          <LoadSection step={1} title="Empleado" description={defaultId ? undefined : 'Buscá por legajo o nombre.'}>
            <FormField
              control={form.control}
              name="employees"
              render={({ fieldState }) => (
                <FormItem>
                  <EmployeeChips
                    value={fixedEmployee ? [fixedEmployee] : employees}
                    onChange={(selected) =>
                      form.setValue('employees', selected, { shouldValidate: form.formState.isSubmitted })
                    }
                    max={1}
                    fixed={Boolean(defaultId)}
                    invalid={Boolean(fieldState.error)}
                    ariaLabel="Empleado de la carga"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </LoadSection>

          <LoadSection step={2} title="Novedad a aplicar">
            <FormField
              control={form.control}
              name="diagramTypeId"
              render={({ field }) => (
                <FormItem>
                  <NoveltySelect
                    options={diagrams_types}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Elegí un tipo de novedad"
                    ariaLabel="Tipo de novedad"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </LoadSection>

          <LoadSection step={3} title="Fechas" description="Se admiten fechas pasadas y futuras.">
            <DateRangeList
              maxRanges={MASSIVE_MAX_RANGES}
              maxTotalDays={INDIVIDUAL_MAX_TOTAL_DAYS}
              presets={INDIVIDUAL_PRESETS}
            />
          </LoadSection>

          <LoadSection step={4} title="Comentario" description="Opcional.">
            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="comments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Comentario</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Ej: certificado médico presentado" className="min-h-20" {...field} />
                    </FormControl>
                    <FormDescription>Se guarda en todos los días, salvo los que personalices.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customizeComments"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer font-normal">Personalizar el comentario por día</FormLabel>
                  </FormItem>
                )}
              />
              {customizeComments ? (
                <p className="text-muted-foreground text-xs">
                  Cada día va a arrancar con el comentario general y lo podés cambiar en la revisión.
                </p>
              ) : null}
            </div>
          </LoadSection>

          <LoadPreview employeeCount={employees.length || (defaultId ? 1 : 0)} dayCount={dayCount} />

          {canSubmit ? (
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto sm:self-start"
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? 'Consultando…' : 'Revisar días'}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">No tenés permiso para cargar ni modificar novedades.</p>
          )}
        </form>
      </Form>
    </div>
  );
}

export default DiagramFormUpdated;
