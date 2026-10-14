import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { formatRowTime } from '../columns/helpers';

/** Sí / No para un booleano nullable (vacío si no hay dato). */
function formatNullableBoolean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return value ? 'Sí' : 'No';
}

/**
 * Formatters del Excel del detalle. Solo las columnas que necesitan traducción: el resto
 * (cliente, servicio, empleados, equipos, roles…) sus `accessorFn` ya devuelven texto legible.
 * Las horas son columnas `Time` (UTC), igual que en pantalla.
 */
export const detailExportFormatters = {
  status: (val: unknown) => dailyReportRowStatusLabels[val as string] ?? String(val ?? ''),
  type_service: (val: unknown) => (val ? (dailyReportTypeServiceLabels[val as string] ?? String(val)) : ''),
  completed_day: formatNullableBoolean,
  completed_night: formatNullableBoolean,
  start_time: (val: unknown) => formatRowTime(val) ?? '',
  end_time: (val: unknown) => formatRowTime(val) ?? '',
};
