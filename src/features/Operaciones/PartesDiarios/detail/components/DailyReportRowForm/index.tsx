'use client';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import moment from 'moment';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useDailyReportDetailFormStore } from '../../../store/dailyReportDetailFormStore';
import { CustomerForForm, EmployeeForForm, OtherEquipmentItem, VehicleForForm, getDailyReportRowForForm } from '../../form-data.server';
import { bulkUpdateRowStatus, createDailyReportRowPrisma, updateDailyReportRowPrisma } from '../../mutations.server';
import { CustomerServiceSection } from './CustomerServiceSection';
import { EmployeeSection } from './EmployeeSection';
import { EquipmentSection, type SavedOtherEquipment } from './EquipmentSection';
import { JornadaSection } from './JornadaSection';
import { ScheduleSection } from './ScheduleSection';
import { DailyReportRowFormValues, dailyReportRowSchema } from './schema';

const logger = new Logger('DailyReportRowForm');

interface DailyReportRowFormProps {
  dailyReportId: string;
  reportDate?: string;
  customers: CustomerForForm[];
  employees: EmployeeForForm[];
  vehicles: VehicleForForm[];
  otherEquipment: OtherEquipmentItem[];
  onSuccess?: () => void;
}

const EMPTY_FORM_VALUES: DailyReportRowFormValues = {
  customer: '',
  services: '',
  item: '',
  employees: [],
  equipment: [],
  other_equipment: [],
  equipos_cliente: [],
  working_day: '',
  start_time: '',
  end_time: '',
  status: 'pendiente',
  description: '',
  document_path: '',
  sector_service_id: undefined,
  areas_service_id: undefined,
  remit_number: '',
  cancel_reason: '',
  reprogram_date: undefined,
  reasigment_reason: '',
  type_service: undefined,
  shift_12h: undefined,
  chofer_dia: undefined,
  chofer_noche: undefined,
  ayudante_dia: [],
  ayudante_noche: [],
  completed_day: false,
  completed_night: false,
};

export function DailyReportRowForm({
  dailyReportId,
  reportDate,
  customers,
  employees,
  vehicles,
  otherEquipment,
  onSuccess,
}: DailyReportRowFormProps) {
  const { isOpen, editingRowId, mode, close } = useDailyReportDetailFormStore();
  const queryClient = useQueryClient();
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  // Otros equipos ya guardados en la fila que se edita. Hace falta para mostrar (y poder
  // quitar) los que ya no están en la lista de opciones: dados de baja o no operativos.
  const [savedOtherEquipment, setSavedOtherEquipment] = useState<SavedOtherEquipment[]>([]);

  // Modo "solo recursos": el supervisor de operaciones únicamente puede asignar
  // personal y equipos; el resto de los campos se muestra pero queda bloqueado.
  const resourcesOnly = mode === 'resources';

  // Snapshots originales para detectar cambios en empleados/equipos al editar
  const originalEmployeeIdsRef = useRef<string[]>([]);
  const originalEquipmentIdsRef = useRef<string[]>([]);

  const isEditMode = editingRowId != null;

  const form = useForm<DailyReportRowFormValues>({
    resolver: zodResolver(dailyReportRowSchema),
    defaultValues: EMPTY_FORM_VALUES,
  });

  // When editing, load the existing row and pre-populate the form
  useEffect(() => {
    if (!isOpen || !editingRowId) return;

    setIsLoadingRow(true);
    getDailyReportRowForForm(editingRowId)
      .then((row) => {
        if (!row) return;

        const workingDay = row.working_day?.toLowerCase() ?? '';
        const is12Hours = workingDay === 'jornada 12 horas';
        const is24Hours = workingDay === 'jornada 24 horas';
        const isRoleBased = is12Hours || is24Hours;

        // Build employees arrays from relations
        const employeeRels = row.dailyreportemployeerelations ?? [];
        type Role = 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';
        const findRole = (role: Role) => employeeRels.find((e) => e.role === role)?.employee_id ?? undefined;
        const filterRole = (role: Role) =>
          employeeRels
            .filter((e) => e.role === role)
            .map((e) => e.employee_id ?? '')
            .filter(Boolean);

        const anyHasRole = employeeRels.some((e) =>
          ['chofer_dia', 'chofer_noche', 'ayudante_dia', 'ayudante_noche'].includes(e.role ?? '')
        );

        // Turno de la jornada 12h: se usa el valor persistido (shift_12h). Para
        // filas viejas anteriores a la columna (shift_12h null) se deriva del
        // personal cargado como fallback: hay gente de noche y no de día → 'noche'.
        const shift12h: 'dia' | 'noche' | undefined = is12Hours
          ? row.shift_12h ??
            (findRole('chofer_noche') || filterRole('ayudante_noche').length > 0
              ? findRole('chofer_dia') || filterRole('ayudante_dia').length > 0
                ? 'dia'
                : 'noche'
              : 'dia')
          : undefined;

        // Equipment ids
        const equipmentRels = row.dailyreportequipmentrelations ?? [];
        const vehicleIds = equipmentRels.filter((r) => r.equipment_id != null).map((r) => r.equipment_id!);
        const otherEqIds = equipmentRels.filter((r) => r.other_equipment_id != null).map((r) => r.other_equipment_id!);
        setSavedOtherEquipment(equipmentRels.flatMap((r) => (r.other_equipment ? [r.other_equipment] : [])));

        // Customer equipment ids
        const customerEqIds = (row.dailyreport_customer_equipment_relations ?? [])
          .map((r) => r.customer_equipment_id)
          .filter(Boolean) as string[];

        // Format times (HH:MM)
        const startTime = row.start_time ? moment(row.start_time).format('HH:mm') : '';
        const endTime = row.end_time ? moment(row.end_time).format('HH:mm') : '';

        form.reset({
          customer: row.customer_id ?? '',
          services: row.service_id ?? '',
          item: row.item_id ?? '',
          status: row.status ?? 'pendiente',
          working_day: row.working_day ?? '',
          start_time: startTime,
          end_time: endTime,
          description: row.description ?? '',
          document_path: row.document_path ?? '',
          sector_service_id: row.sector_service_id ?? undefined,
          areas_service_id: row.areas_service_id ?? undefined,
          remit_number: row.remit_number ?? '',
          cancel_reason: row.cancel_reason ?? '',
          type_service: (row.type_service as DailyReportRowFormValues['type_service']) ?? undefined,
          shift_12h: shift12h,
          completed_day: row.completed_day ?? false,
          completed_night: row.completed_night ?? false,
          equipos_cliente: customerEqIds,
          equipment: vehicleIds,
          other_equipment: otherEqIds,
          // Employees with/without roles
          employees: isRoleBased && anyHasRole ? [] : employeeRels.map((e) => e.employee_id ?? '').filter(Boolean),
          chofer_dia: isRoleBased && anyHasRole ? findRole('chofer_dia') : undefined,
          chofer_noche: isRoleBased && anyHasRole ? findRole('chofer_noche') : undefined,
          ayudante_dia: isRoleBased && anyHasRole ? filterRole('ayudante_dia') : [],
          ayudante_noche: isRoleBased && anyHasRole ? filterRole('ayudante_noche') : [],
          reasigment_reason: '',
          reprogram_date: undefined,
        });

        // Snapshot original — incluye TODOS los empleados (con o sin rol) y vehículos propios
        originalEmployeeIdsRef.current = employeeRels.map((e) => e.employee_id ?? '').filter(Boolean);
        originalEquipmentIdsRef.current = vehicleIds;
      })
      .catch((err) => {
        logger.error('Error al cargar la fila para editar', { data: { err } });
        toast.error('No se pudo cargar la fila para editar');
      })
      .finally(() => setIsLoadingRow(false));
  }, [isOpen, editingRowId, form]);

  const handleClose = () => {
    close();
    form.reset(EMPTY_FORM_VALUES);
    originalEmployeeIdsRef.current = [];
    originalEquipmentIdsRef.current = [];
    setSavedOtherEquipment([]);
  };

  const onSubmit = async (data: DailyReportRowFormValues) => {
    const workingDayLower = data.working_day?.toLowerCase() ?? '';
    const is12Hours = workingDayLower === 'jornada 12 horas';
    const is24Hours = workingDayLower === 'jornada 24 horas';
    const isRoleBased = is12Hours || is24Hours;

    type EmployeeRole = 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';
    const employeesWithRoles: Array<{ id: string; role?: EmployeeRole }> = [];

    if (isRoleBased) {
      if (data.chofer_dia) employeesWithRoles.push({ id: data.chofer_dia, role: 'chofer_dia' });
      (data.ayudante_dia ?? []).forEach((id) => employeesWithRoles.push({ id, role: 'ayudante_dia' }));
      if (data.chofer_noche) employeesWithRoles.push({ id: data.chofer_noche, role: 'chofer_noche' });
      (data.ayudante_noche ?? []).forEach((id) => employeesWithRoles.push({ id, role: 'ayudante_noche' }));
    }

    const employeeIds = isRoleBased ? employeesWithRoles : (data.employees ?? []).map((id) => ({ id }));

    // El tipo de servicio es obligatorio al crear/editar la fila. En modo "solo
    // recursos" el campo está bloqueado (el supervisor no puede tocarlo), así que
    // se respeta el valor ya guardado de la fila y no se exige re-seleccionarlo.
    if (!resourcesOnly && !data.type_service) {
      form.setError('type_service', {
        type: 'manual',
        message: 'Debe seleccionar un tipo de servicio',
      });
      return;
    }

    // Validación: motivo de reasignación obligatorio si en edición se removieron/reemplazaron
    // empleados o equipos respecto al estado original (replicado de prod)
    if (isEditMode) {
      const currentEmployeeIds = isRoleBased ? employeesWithRoles.map((e) => e.id) : data.employees ?? [];
      const currentEquipmentIds = data.equipment ?? [];

      const originalEmployeeIds = originalEmployeeIdsRef.current;
      const originalEquipmentIds = originalEquipmentIdsRef.current;

      const employeeHasChanged =
        originalEmployeeIds.length > currentEmployeeIds.length ||
        !originalEmployeeIds.every((id) => currentEmployeeIds.includes(id));

      const equipmentHasChanged =
        originalEquipmentIds.length > currentEquipmentIds.length ||
        !originalEquipmentIds.every((id) => currentEquipmentIds.includes(id));

      if (employeeHasChanged || equipmentHasChanged) {
        if (!data.reasigment_reason || data.reasigment_reason.trim() === '') {
          form.setError('reasigment_reason', {
            type: 'manual',
            message: 'Debe ingresar un motivo de reasignación',
          });
          return;
        }
      }
    }

    const rowInput = {
      customer_id: data.customer,
      service_id: data.services,
      item_id: data.item,
      status: data.completed_day && data.completed_night ? 'ejecutado' : data.status,
      working_day: data.working_day,
      // El turno solo aplica a jornada 12h; en el resto se persiste null.
      shift_12h: is12Hours ? data.shift_12h ?? 'dia' : null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      description: data.description ?? null,
      sector_service_id: data.sector_service_id ?? null,
      areas_service_id: data.areas_service_id ?? null,
      remit_number: data.remit_number?.trim() ? data.remit_number.trim() : null,
      cancel_reason: data.cancel_reason ?? null,
      completed_day: data.completed_day ?? null,
      completed_night: data.completed_night ?? null,
      type_service: data.type_service ?? null,
      employees: employeeIds,
      equipment: data.equipment ?? [],
      other_equipment: data.other_equipment ?? [],
      customer_equipment: data.equipos_cliente ?? [],
    };

    // Reprogramación: cuando el usuario marca la fila como 'reprogramado' y elige
    // una fecha destino, NO basta con actualizar el status. Hay que clonar la fila
    // a la fecha destino (creando el parte si no existe) y marcar la original como
    // 'reprogramado'. Reusamos bulkUpdateRowStatus para mantener exactamente la
    // misma lógica que el BulkEditModal (clona sin recursos).
    const isReprogramming = isEditMode && !!editingRowId && data.status === 'reprogramado' && !!data.reprogram_date;

    toast.promise(
      async () => {
        if (isEditMode && editingRowId && data.status === 'reprogramado' && data.reprogram_date) {
          await bulkUpdateRowStatus([editingRowId], {
            status: 'reprogramado',
            reschedule_date: moment(data.reprogram_date).format('YYYY-MM-DD'),
          });
        } else if (isEditMode && editingRowId) {
          await updateDailyReportRowPrisma(editingRowId, rowInput);
        } else {
          await createDailyReportRowPrisma({ ...rowInput, daily_report_id: dailyReportId });
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['daily-report-detail', dailyReportId] }),
          queryClient.invalidateQueries({ queryKey: ['datatable-facet'] }),
          queryClient.invalidateQueries({ queryKey: ['daily-report-deviations'] }),
        ]);
        handleClose();
        onSuccess?.();
      },
      {
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
      }
    );
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
  // Solo visible en edición cuando se removieron/reemplazaron empleados o equipos vs el original.
  const watchedEmployees = form.watch('employees');
  const watchedEquipment = form.watch('equipment');
  const watchedWorkingDay = form.watch('working_day');
  const watchedChoferDia = form.watch('chofer_dia');
  const watchedChoferNoche = form.watch('chofer_noche');
  const watchedAyudanteDia = form.watch('ayudante_dia');
  const watchedAyudanteNoche = form.watch('ayudante_noche');

  const showReasigmentReason = useMemo(() => {
    if (!isEditMode) return false;
    const wdLower = watchedWorkingDay?.toLowerCase() ?? '';
    const isRoleBased = wdLower === 'jornada 12 horas' || wdLower === 'jornada 24 horas';
    const currentEmployeeIds = isRoleBased
      ? [watchedChoferDia, watchedChoferNoche, ...(watchedAyudanteDia ?? []), ...(watchedAyudanteNoche ?? [])].filter(
          (x): x is string => Boolean(x)
        )
      : watchedEmployees ?? [];
    const currentEquipmentIds = watchedEquipment ?? [];

    const empOrig = originalEmployeeIdsRef.current;
    const eqOrig = originalEquipmentIdsRef.current;

    const employeeChanged =
      empOrig.length > currentEmployeeIds.length || !empOrig.every((id) => currentEmployeeIds.includes(id));
    const equipmentChanged =
      eqOrig.length > currentEquipmentIds.length || !eqOrig.every((id) => currentEquipmentIds.includes(id));

    return employeeChanged || equipmentChanged;
  }, [
    isEditMode,
    watchedEmployees,
    watchedEquipment,
    watchedWorkingDay,
    watchedChoferDia,
    watchedChoferNoche,
    watchedAyudanteDia,
    watchedAyudanteNoche,
  ]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            {resourcesOnly ? 'Asignar recursos' : `${isEditMode ? 'Editar' : 'Agregar'} fila del parte diario`}
          </SheetTitle>
          <SheetDescription>
            {resourcesOnly
              ? 'Asigne el personal y los equipos de esta línea. El resto de los campos no se puede modificar.'
              : isEditMode
                ? 'Actualice los campos necesarios para modificar la fila.'
                : 'Complete los campos para agregar una nueva fila al parte diario.'}
          </SheetDescription>
        </SheetHeader>

        {isEditMode && isLoadingRow ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando datos de la fila...</p>
          </div>
        ) : (
          <div className="px-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* En modo "solo recursos" estas secciones se muestran pero quedan
                    bloqueadas: el fieldset deshabilita todos sus controles. */}
                <fieldset disabled={resourcesOnly} className="disabled:opacity-70">
                  <SectionCard title="Cliente y servicio">
                    <div className="space-y-4">
                      <CustomerServiceSection form={form} customers={customers} isEditMode={isEditMode} />

                      <JornadaSection form={form} />
                    </div>
                  </SectionCard>
                </fieldset>

                <SectionCard title="Personal">
                {itemNeedsPersonnel && (
                  <EmployeeSection
                    form={form}
                    employees={employees}
                    selectedCustomerId={watchedCustomerId || null}
                    onOpenEmployeeSelector={() => {
                      // Task 7: EmployeeSelectorDialog — not yet created
                      logger.info('Employee selector dialog — pendiente de implementación');
                    }}
                  />
                )}

                {!itemNeedsPersonnel && (
                  <p className="text-muted-foreground text-sm">{selectedItemName} no requiere personal.</p>
                )}
                </SectionCard>

                <SectionCard title="Equipos">
                <EquipmentSection
                  form={form}
                  vehicles={vehicles}
                  otherEquipment={otherEquipment}
                  savedOtherEquipment={savedOtherEquipment}
                  selectedCustomerId={watchedCustomerId || null}
                  itemNeedsEquipment={itemNeedsEquipment}
                  selectedItemName={selectedItemName}
                  onOpenEquipmentSelector={() => {
                    // Task 8: EquipmentSelectorDialog — not yet created
                    logger.info('Equipment selector dialog — pendiente de implementación');
                  }}
                />
                </SectionCard>

                <SectionCard title="Estado y horario">
                <ScheduleSection
                  form={form}
                  isEditMode={isEditMode}
                  reportDate={reportDate}
                  showReasigmentReason={showReasigmentReason}
                  disabled={resourcesOnly}
                />
                </SectionCard>

                <div className="bg-background/90 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-3 backdrop-blur-sm">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="brand"
                    disabled={form.formState.isSubmitting}
                    aria-busy={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {resourcesOnly ? 'Guardar' : isEditMode ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

      </SheetContent>
    </Sheet>
  );
}
