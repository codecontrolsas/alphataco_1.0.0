import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import moment from 'moment';
import { documentListStateLabels } from '../shared/components/DocumentCells';

/** `Sí` / `No` para los booleanos que llegan como boolean o como texto. */
export function formatExportBoolean(value: unknown): string {
  if (value === true || value === 'true') return 'Sí';
  if (value === false || value === 'false') return 'No';
  return '';
}

/** Día argentino de un timestamp (`created_at`, `validity`). */
export function formatExportDay(value: unknown): string {
  return value ? formatArgentinaDay(value as string | Date) : '';
}

/**
 * Formatters de export comunes a las 4 listas de documentos (los de las columnas propias de cada una se
 * suman en su tabla). `Ya no aplica` reemplaza al estado en las filas archivadas.
 */
export function commonDocumentExportFormatters<Row extends { notApplicable?: boolean }>() {
  return {
    state: (value: unknown, row: Row) =>
      row.notApplicable ? 'Ya no aplica' : documentListStateLabels[value as string] ?? String(value ?? ''),
    mandatory: formatExportBoolean,
    multiresource: formatExportBoolean,
    created_at: formatExportDay,
    deny_reason: (value: unknown) => String(value ?? '-'),
  };
}

/**
 * Fecha de una columna `@db.Date` (medianoche UTC) como `DD/MM/YYYY`. NO usa `formatArgentinaDay`: ese
 * pasa el instante a hora argentina y mostraría el día anterior.
 */
export function formatExportDbDate(value: unknown): string {
  return value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : '';
}

/** Dominio, serie o N° interno del equipo, en ese orden de preferencia. */
export function equipmentDocumentLabel(row: {
  vehicles?: { domain?: string | null; serie?: string | null; intern_number?: string | null } | null;
}): string {
  return row.vehicles?.domain ?? row.vehicles?.serie ?? row.vehicles?.intern_number ?? 'Equipo';
}
