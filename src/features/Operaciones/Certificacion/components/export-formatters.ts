/**
 * Formateo del Excel del tablero de certificación.
 *
 * Las columnas de lista (empleados, equipos, remitos) ya devuelven el texto unido desde su
 * `accessorFn`; acá se traducen los enums y la fecha, y las celdas vacías salen como `-`.
 */

import { formatDateAr } from '@/shared/lib/argentina-time';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';

/** Texto de una celda del Excel; vacío → `-`. */
function textOrDash(value: unknown): string {
  const text = value == null ? '' : String(value);
  return text.trim() === '' ? '-' : text;
}

/** Formatters por id de columna (los que reciben `exportConfig.formatters`). */
export const certificationExportFormatters: Record<string, (value: unknown) => string> = {
  // La fecha del parte llega como `YYYY-MM-DD`.
  date: (value) => (typeof value === 'string' && value ? formatDateAr(value) : '-'),
  type_service: (value) => (typeof value === 'string' ? (dailyReportTypeServiceLabels[value] ?? value) : '-'),
  status: (value) => (typeof value === 'string' ? (dailyReportRowStatusLabels[value] ?? value) : '-'),
  customer: textOrDash,
  service: textOrDash,
  item: textOrDash,
  item_description: textOrDash,
  customer_equipment: textOrDash,
  area: textOrDash,
  sector: textOrDash,
  remit_number: textOrDash,
  employees: textOrDash,
  equipment: textOrDash,
  working_day: textOrDash,
  description: textOrDash,
};
