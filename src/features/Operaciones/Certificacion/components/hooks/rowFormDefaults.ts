import type { DailyReportFormRow } from '@/shared/store/useDailyReportFormStore';
import moment from 'moment';
import 'moment/locale/es';
import type { DailyReportRowFormValues } from '../form-types';

/** Valores iniciales del alta. */
export function buildCreateDefaults(): DailyReportRowFormValues {
  return {
    customer: '',
    services: '',
    item: '',
    date: undefined,
    start_time: '',
    end_time: '',
    working_day: '',
    employees: [],
    equipment: [],
    equipos_cliente: [],
    status: 'en_certificacion',
    remit_number: '',
    observations: '',
    sector_service_id: '',
    areas_service_id: '',
    type_service: undefined,
  };
}

/** Valores iniciales de la edición, tomados de la fila seleccionada. */
export function buildEditDefaults(selectedRow: DailyReportFormRow | null): DailyReportRowFormValues {
  const blank = { ...buildCreateDefaults(), status: '' };
  if (!selectedRow) return blank;

  // Extraer IDs de empleados y equipos de las referencias
  const toIds = (references: Array<{ id?: string | null }> | null | undefined) =>
    references?.map((reference) => reference.id).filter((id): id is string => !!id) || [];

  return {
    customer: selectedRow.data_to_clone?.customer_id || '',
    services: selectedRow.data_to_clone?.service_id || '',
    item: selectedRow.data_to_clone?.item_id || '',
    date: selectedRow.date ? new Date(selectedRow.date) : undefined,
    start_time: selectedRow.start_time || '',
    end_time: selectedRow.end_time || '',
    working_day: selectedRow.working_day?.toLowerCase() || '',
    employees: toIds(selectedRow.employees_references),
    equipment: toIds(selectedRow.equipment_references),
    equipos_cliente: toIds(selectedRow.customer_equipment),
    status: selectedRow.status || '',
    remit_number: selectedRow.remit_number || '',
    observations: selectedRow.description || '', // Cargar description en observations
    sector_service_id: selectedRow.data_to_clone?.sector_service_id || '',
    areas_service_id: selectedRow.data_to_clone?.areas_service_id || '',
    // Arrastrar el tipo de servicio de la fila de origen para no perderlo al clonar/editar.
    type_service: selectedRow.data_to_clone?.type_service || undefined,
    completed_day: selectedRow.completed_day || false,
    completed_night: selectedRow.completed_night || false,
  };
}

/** Fecha del parte para el encabezado del formulario (DD/MM/YYYY), o `null` si no hay. */
export function formatReportDate(
  isCreating: boolean,
  formDate: Date | undefined,
  rowDate: string | null | undefined
): string | null {
  if (isCreating) {
    return formDate ? moment(formDate).locale('es').format('DD/MM/YYYY') : null;
  }
  if (!rowDate) return null;

  // La fecha puede venir en formato "DD-MM-YYYY" o como ISO
  try {
    if (rowDate.includes('-')) {
      const parts = rowDate.split('-');
      if (parts.length === 3 && parts[0].length === 2) {
        return moment(rowDate, 'DD-MM-YYYY').locale('es').format('DD/MM/YYYY');
      }
    }
    return moment(new Date(rowDate)).locale('es').format('DD/MM/YYYY');
  } catch {
    // Si falla el parseo, mostrar la fecha tal como viene
    return rowDate;
  }
}
