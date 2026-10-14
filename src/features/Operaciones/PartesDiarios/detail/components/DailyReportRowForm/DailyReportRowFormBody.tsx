'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock } from 'lucide-react';
import moment from 'moment';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { employeeDeviations, equipmentDeviations } from '../../../lib/resource-deviations';
import { useDailyReportDetailInvalidation } from '../../hooks/useDailyReportDetail';
import { useValidationData } from '../../hooks/useValidationData';
import type {
  CustomerForForm,
  DailyReportRowForForm,
  EmployeeForForm,
  OtherEquipmentItem,
  VehicleForForm,
} from '../../form-data.server';
import { bulkUpdateRowStatus, createDailyReportRowPrisma, updateDailyReportRowPrisma } from '../../mutations.server';
import { CustomerServiceSection } from './CustomerServiceSection';
import { EmployeeSection } from './EmployeeSection';
import { EquipmentSection } from './EquipmentSection';
import { JornadaSection } from './JornadaSection';
import {
  EMPTY_FORM_VALUES,
  buildRowFormValues,
  buildRowInput,
  collectFormEmployeeIds,
  hasResourceReassignment,
} from './lib/row-form-values';
import { ScheduleSection } from './ScheduleSection';
import { DailyReportRowFormValues, dailyReportRowSchema } from './schema';

const logger = new Logger('DailyReportRowForm');

interface DailyReportRowFormBodyProps {
  dailyReportId: string;
  reportDate?: string;
  customers: CustomerForForm[];
  employees: EmployeeForForm[];
  vehicles: VehicleForForm[];
  otherEquipment: OtherEquipmentItem[];
  /** Fila guardada que se edita. `null` al crear una línea nueva. */
  row: NonNullable<DailyReportRowForForm> | null;
  /** Modo "solo recursos": el supervisor de operaciones únicamente asigna personal y equipos. */
  resourcesOnly: boolean;
  /** Cierra el panel (tras guardar con éxito). */
  onClose: () => void;
  /** Avisa al panel que hay un guardado en curso para que no se pueda cerrar. */
  onSavingChange: (isSaving: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Formulario de la línea. Se monta recién cuando la fila ya cargó (o al crear), así los valores iniciales
 * entran por `defaultValues` y el snapshot de recursos originales es estable durante toda la edición.
 */
export function DailyReportRowFormBody({
  dailyReportId,
  reportDate,
  customers,
  employees,
  vehicles,
  otherEquipment,
  row,
  resourcesOnly,
  onClose,
  onSavingChange,
  onSuccess,
}: DailyReportRowFormBodyProps) {
  const { invalidateDetail } = useDailyReportDetailInvalidation();
  const [snapshot] = useState(() => (row ? buildRowFormValues(row) : null));

  const isEditMode = row != null;
  const editingRowId = row?.id ?? null;
  const originalEmployeeIds = useMemo(() => snapshot?.originalEmployeeIds ?? [], [snapshot]);
  const originalEquipmentIds = useMemo(() => snapshot?.originalEquipmentIds ?? [], [snapshot]);
  // Otros equipos ya guardados en la fila: hace falta para mostrar (y poder quitar) los que ya no están
  // en la lista de opciones (dados de baja o no operativos).
  const savedOtherEquipment = snapshot?.savedOtherEquipment ?? [];

  const form = useForm<DailyReportRowFormValues>({
    resolver: zodResolver(dailyReportRowSchema),
    defaultValues: snapshot?.values ?? EMPTY_FORM_VALUES,
  });

  const onSubmit = async (data: DailyReportRowFormValues) => {
    // El tipo de servicio es obligatorio al crear/editar la fila. En modo "solo recursos" el campo
    // está bloqueado (el supervisor no puede tocarlo), así que se respeta el valor ya guardado de la fila.
    if (!resourcesOnly && !data.type_service) {
      form.setError('type_service', {
        type: 'manual',
        message: 'Debe seleccionar un tipo de servicio',
      });
      return;
    }

    // Motivo de reasignación obligatorio si en edición se quitaron/reemplazaron empleados o equipos
    // respecto al estado original (replicado de prod)
    if (isEditMode) {
      const needsReason = hasResourceReassignment({
        originalEmployeeIds,
        originalEquipmentIds,
        currentEmployeeIds: collectFormEmployeeIds(data),
        currentEquipmentIds: data.equipment ?? [],
      });

      if (needsReason && (!data.reasigment_reason || data.reasigment_reason.trim() === '')) {
        form.setError('reasigment_reason', {
          type: 'manual',
          message: 'Debe ingresar un motivo de reasignación',
        });
        return;
      }
    }

    const rowInput = buildRowInput(data);

    // Reprogramación: cuando el usuario marca la fila como 'reprogramado' y elige una fecha destino, NO basta
    // con actualizar el status. Hay que clonar la fila a la fecha destino (creando el parte si no existe) y
    // marcar la original como 'reprogramado'. Reusamos bulkUpdateRowStatus para mantener exactamente la misma
    // lógica que el BulkEditModal (clona sin recursos).
    const isReprogramming = isEditMode && data.status === 'reprogramado' && !!data.reprogram_date;

    onSavingChange(true);

    // La promesa se espera al final: así `isSubmitting` sigue en true hasta que el servidor responde
    // y el botón Guardar no se rehabilita mientras tanto (evita crear la línea dos veces).
    const run = (async () => {
      if (editingRowId && data.status === 'reprogramado' && data.reprogram_date) {
        await bulkUpdateRowStatus([editingRowId], {
          status: 'reprogramado',
          reschedule_date: moment(data.reprogram_date).format('YYYY-MM-DD'),
        });
      } else if (editingRowId) {
        await updateDailyReportRowPrisma(editingRowId, rowInput);
      } else {
        await createDailyReportRowPrisma({ ...rowInput, daily_report_id: dailyReportId });
      }

      invalidateDetail();
      onClose();
      onSuccess?.();
    })();

    toast.promise(run, {
      loading: isReprogramming
        ? 'Reprogramando fila del parte...'
        : isEditMode
          ? 'Actualizando fila del parte...'
          : 'Creando fila del parte...',
      success: isReprogramming
        ? 'Fila reprogramada exitosamente'
        : isEditMode
          ? 'Fila del parte actualizada exitosamente'
          : 'Fila del parte creada exitosamente',
      error: isReprogramming
        ? 'Error al reprogramar la fila'
        : isEditMode
          ? 'Error al actualizar la fila'
          : 'Error al crear la fila',
    });

    await run.catch((error: unknown) => {
      logger.error('Error al guardar la fila del parte', { data: { error, editingRowId } });
    });
    onSavingChange(false);
  };

  // Derive item info for sections
  const watchedCustomerId = form.watch('customer');
  const watchedServiceId = form.watch('services');
  const watchedItemId = form.watch('item');

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === watchedCustomerId) ?? null,
    [customers, watchedCustomerId]
  );

  const selectedService = useMemo(
    () => selectedCustomer?.customer_services?.find((s) => s.id === watchedServiceId) ?? null,
    [selectedCustomer, watchedServiceId]
  );

  const selectedItem = useMemo(
    () => selectedService?.service_items?.find((i) => i.id === watchedItemId) ?? null,
    [selectedService, watchedItemId]
  );

  const itemNeedsPersonnel = selectedItem?.needs_personnel ?? true;
  const itemNeedsEquipment = selectedItem?.needs_equipment ?? true;
  const selectedItemName = selectedItem?.item_name ?? 'El ítem seleccionado';

  // Visibilidad del campo "Motivo de reasignación" (replicado de prod):
  // solo visible en edición cuando se quitaron/reemplazaron empleados o equipos vs el original.
  const showReasigmentReason =
    isEditMode &&
    hasResourceReassignment({
      originalEmployeeIds,
      originalEquipmentIds,
      currentEmployeeIds: collectFormEmployeeIds({
        working_day: form.watch('working_day'),
        employees: form.watch('employees'),
        chofer_dia: form.watch('chofer_dia'),
        chofer_noche: form.watch('chofer_noche'),
        ayudante_dia: form.watch('ayudante_dia'),
        ayudante_noche: form.watch('ayudante_noche'),
      }),
      currentEquipmentIds: form.watch('equipment') ?? [],
    });

  // Avisos de desvío de los recursos YA guardados en la fila (misma queryKey que la tabla: no repite consulta).
  const { getEmployeeDeviation, getEquipmentDeviation } = useValidationData(dailyReportId, reportDate ?? '');
  let savedWarningCount = 0;
  if (editingRowId) {
    for (const employeeId of originalEmployeeIds) {
      const deviation = getEmployeeDeviation(employeeId, editingRowId);
      if (deviation) savedWarningCount += employeeDeviations(deviation).length;
    }
    const savedEquipmentIds = [...originalEquipmentIds, ...savedOtherEquipment.map((eq) => eq.id)];
    for (const equipmentId of savedEquipmentIds) {
      const deviation = getEquipmentDeviation(equipmentId, editingRowId);
      if (deviation) savedWarningCount += equipmentDeviations(deviation).length;
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const submitLabel = resourcesOnly || isEditMode ? 'Guardar' : 'Crear línea';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {resourcesOnly && (
            <Alert variant="info">
              <Lock aria-hidden="true" />
              <AlertDescription>
                Solo podés asignar personal y equipos. El resto de la línea la edita Comercial.
              </AlertDescription>
            </Alert>
          )}

          {/* En modo "solo recursos" estas secciones se muestran pero quedan
              bloqueadas: el fieldset deshabilita todos sus controles. */}
          <fieldset disabled={resourcesOnly} className="space-y-4 disabled:opacity-70">
            <CustomerServiceSection form={form} customers={customers} isEditMode={isEditMode} />

            <JornadaSection form={form} />
          </fieldset>

          {itemNeedsPersonnel && (
            <EmployeeSection
              form={form}
              employees={employees}
              selectedCustomerId={watchedCustomerId || null}
              rowId={editingRowId}
              savedEmployeeIds={originalEmployeeIds}
              getEmployeeDeviation={getEmployeeDeviation}
            />
          )}

          {!itemNeedsPersonnel && (
            <section aria-labelledby="row-form-personnel" className="space-y-2 rounded-lg border bg-card p-4">
              <h3 id="row-form-personnel" className="text-foreground text-sm font-semibold">
                Personal
              </h3>
              <p className="text-muted-foreground text-sm italic">{selectedItemName} no requiere personal.</p>
            </section>
          )}

          <EquipmentSection
            form={form}
            vehicles={vehicles}
            otherEquipment={otherEquipment}
            savedOtherEquipment={savedOtherEquipment}
            selectedCustomerId={watchedCustomerId || null}
            itemNeedsEquipment={itemNeedsEquipment}
            selectedItemName={selectedItemName}
          />

          <ScheduleSection
            form={form}
            isEditMode={isEditMode}
            reportDate={reportDate}
            showReasigmentReason={showReasigmentReason}
            disabled={resourcesOnly}
          />
        </div>

        <div className="bg-background flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <p role="status" className="text-warn-subtle-foreground min-w-0 text-sm tabular-nums">
            {savedWarningCount > 0
              ? `${savedWarningCount} ${savedWarningCount === 1 ? 'aviso' : 'avisos'}: se puede guardar igual`
              : null}
          </p>
          <div className="ml-auto flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
