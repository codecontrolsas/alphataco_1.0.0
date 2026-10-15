import moment from 'moment';
import type { DailyReportRowForForm } from '../../../form-data.server';
import type { SavedOtherEquipment } from '../EquipmentSection';
import type { DailyReportRowFormValues } from '../schema';

type LoadedRow = NonNullable<DailyReportRowForForm>;

type EmployeeRole = 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';

const EMPLOYEE_ROLES: EmployeeRole[] = ['chofer_dia', 'chofer_noche', 'ayudante_dia', 'ayudante_noche'];

export const EMPTY_FORM_VALUES: DailyReportRowFormValues = {
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

/** Jornadas cuyo personal se carga por rol (chofer / ayudantes de día y de noche). */
export function isRoleBasedWorkingDay(workingDay: string | null | undefined) {
  const value = workingDay?.toLowerCase() ?? '';
  return value === 'jornada 12 horas' || value === 'jornada 24 horas';
}

type EmployeeFields = Pick<
  DailyReportRowFormValues,
  'working_day' | 'employees' | 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche'
>;

/** Ids de empleados que el formulario tiene hoy cargados, con o sin rol según la jornada. */
export function collectFormEmployeeIds(values: EmployeeFields): string[] {
  if (!isRoleBasedWorkingDay(values.working_day)) return values.employees ?? [];
  return [
    values.chofer_dia,
    ...(values.ayudante_dia ?? []),
    values.chofer_noche,
    ...(values.ayudante_noche ?? []),
  ].filter((id): id is string => Boolean(id));
}

/** `true` si falta alguno de los ids originales o si ahora hay menos (se quitó o reemplazó un recurso). */
function hasRemovedIds(original: string[], current: string[]) {
  return original.length > current.length || !original.every((id) => current.includes(id));
}

/** Se quitó o reemplazó personal o equipos respecto de lo guardado: exige motivo de reasignación. */
export function hasResourceReassignment(params: {
  originalEmployeeIds: string[];
  originalEquipmentIds: string[];
  currentEmployeeIds: string[];
  currentEquipmentIds: string[];
}) {
  return (
    hasRemovedIds(params.originalEmployeeIds, params.currentEmployeeIds) ||
    hasRemovedIds(params.originalEquipmentIds, params.currentEquipmentIds)
  );
}

export interface RowFormSnapshot {
  values: DailyReportRowFormValues;
  /** Todos los empleados guardados en la fila (con o sin rol). */
  originalEmployeeIds: string[];
  /** Vehículos propios guardados en la fila. */
  originalEquipmentIds: string[];
  /** Otros equipos guardados (incluye dados de baja o no operativos que ya no están en las opciones). */
  savedOtherEquipment: SavedOtherEquipment[];
}

/** Valores iniciales del formulario a partir de la fila guardada, más el snapshot para detectar reasignaciones. */
export function buildRowFormValues(row: LoadedRow): RowFormSnapshot {
  const workingDay = row.working_day?.toLowerCase() ?? '';
  const is12Hours = workingDay === 'jornada 12 horas';
  const isRoleBased = isRoleBasedWorkingDay(row.working_day);

  const employeeRels = row.dailyreportemployeerelations ?? [];
  const findRole = (role: EmployeeRole) => employeeRels.find((e) => e.role === role)?.employee_id ?? undefined;
  const filterRole = (role: EmployeeRole) =>
    employeeRels
      .filter((e) => e.role === role)
      .map((e) => e.employee_id ?? '')
      .filter(Boolean);

  const anyHasRole = employeeRels.some((e) => EMPLOYEE_ROLES.includes(e.role as EmployeeRole));
  const useRoles = isRoleBased && anyHasRole;

  // Turno de la jornada 12h: se usa el valor persistido (shift_12h). Para filas viejas anteriores a la
  // columna (shift_12h null) se deriva del personal cargado como fallback: hay gente de noche y no de día → 'noche'.
  const shift12h: 'dia' | 'noche' | undefined = is12Hours
    ? row.shift_12h ??
      (findRole('chofer_noche') || filterRole('ayudante_noche').length > 0
        ? findRole('chofer_dia') || filterRole('ayudante_dia').length > 0
          ? 'dia'
          : 'noche'
        : 'dia')
    : undefined;

  const equipmentRels = row.dailyreportequipmentrelations ?? [];
  const vehicleIds = equipmentRels.filter((r) => r.equipment_id != null).map((r) => r.equipment_id!);
  const otherEquipmentIds = equipmentRels.filter((r) => r.other_equipment_id != null).map((r) => r.other_equipment_id!);

  const customerEquipmentIds = (row.dailyreport_customer_equipment_relations ?? [])
    .map((r) => r.customer_equipment_id)
    .filter(Boolean) as string[];

  const allEmployeeIds = employeeRels.map((e) => e.employee_id ?? '').filter(Boolean);

  const values: DailyReportRowFormValues = {
    customer: row.customer_id ?? '',
    services: row.service_id ?? '',
    item: row.item_id ?? '',
    status: row.status ?? 'pendiente',
    working_day: row.working_day ?? '',
    start_time: row.start_time ? moment(row.start_time).format('HH:mm') : '',
    end_time: row.end_time ? moment(row.end_time).format('HH:mm') : '',
    description: row.description ?? '',
    document_path: row.document_path ?? '',
    sector_service_id: row.sector_service_id ?? undefined,
    areas_service_id: row.areas_service_id ?? undefined,
    cancel_reason: row.cancel_reason ?? '',
    type_service: (row.type_service as DailyReportRowFormValues['type_service']) ?? undefined,
    shift_12h: shift12h,
    completed_day: row.completed_day ?? false,
    completed_night: row.completed_night ?? false,
    equipos_cliente: customerEquipmentIds,
    equipment: vehicleIds,
    other_equipment: otherEquipmentIds,
    // Empleados con o sin rol según la jornada
    employees: useRoles ? [] : allEmployeeIds,
    chofer_dia: useRoles ? findRole('chofer_dia') : undefined,
    chofer_noche: useRoles ? findRole('chofer_noche') : undefined,
    ayudante_dia: useRoles ? filterRole('ayudante_dia') : [],
    ayudante_noche: useRoles ? filterRole('ayudante_noche') : [],
    reasigment_reason: '',
    reprogram_date: undefined,
  };

  return {
    values,
    originalEmployeeIds: allEmployeeIds,
    originalEquipmentIds: vehicleIds,
    savedOtherEquipment: equipmentRels.flatMap((r) => (r.other_equipment ? [r.other_equipment] : [])),
  };
}

/** Payload que reciben las server actions de crear y editar la fila. */
export function buildRowInput(data: DailyReportRowFormValues) {
  const is12Hours = data.working_day?.toLowerCase() === 'jornada 12 horas';

  const employees = isRoleBasedWorkingDay(data.working_day)
    ? [
        ...(data.chofer_dia ? [{ id: data.chofer_dia, role: 'chofer_dia' as const }] : []),
        ...(data.ayudante_dia ?? []).map((id) => ({ id, role: 'ayudante_dia' as const })),
        ...(data.chofer_noche ? [{ id: data.chofer_noche, role: 'chofer_noche' as const }] : []),
        ...(data.ayudante_noche ?? []).map((id) => ({ id, role: 'ayudante_noche' as const })),
      ]
    : (data.employees ?? []).map((id) => ({ id }));

  return {
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
    cancel_reason: data.cancel_reason ?? null,
    completed_day: data.completed_day ?? null,
    completed_night: data.completed_night ?? null,
    type_service: data.type_service ?? null,
    employees,
    equipment: data.equipment ?? [],
    other_equipment: data.other_equipment ?? [],
    customer_equipment: data.equipos_cliente ?? [],
  };
}
