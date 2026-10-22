import { argentinaDate } from '@/shared/lib/argentina-time';
import type { Permissions } from '../columns/types';
import { toReportDateString } from './report-date';

/**
 * Permisos y elegibilidad de las líneas del parte. Réplica LITERAL de la lógica que vivía en
 * `_DailyReportDetailDataTable` (crear) y `RowActionsCell` (editar/asignar/eliminar): no cambiar
 * las reglas acá sin cambiarlas en el negocio.
 */

type RowStatusLike = { status: string };

/**
 * "Hoy" es el día argentino y se compara como string `YYYY-MM-DD`: con `moment()` local el servidor
 * (UTC) y el navegador discrepaban entre las 21 y las 24 h, y la hidratación no coincidía.
 * `reportDate` es la columna `@db.Date` (string o Date a medianoche UTC): se normaliza antes de comparar.
 */
export function isReportToday(reportDate: string | Date): boolean {
  return toReportDateString(reportDate) === argentinaDate();
}

export function isReportInFuture(reportDate: string | Date): boolean {
  return toReportDateString(reportDate) > argentinaDate();
}

/** Crear: disponible si canUpdate Y (parte abierto O es el día de hoy). */
export function canCreateRows(params: { canUpdate: boolean; dailyReportStatus: string; reportDate: string }): boolean {
  return params.canUpdate && (params.dailyReportStatus === 'abierto' || isReportToday(params.reportDate));
}

/** Editar: no permitir si ejecutado (salvo hoy) ni en_certificacion. */
export function canEditRow(row: RowStatusLike, permissions: Permissions, reportDate: string): boolean {
  return (
    permissions.canUpdate && row.status !== 'en_certificacion' && (row.status !== 'ejecutado' || isReportToday(reportDate))
  );
}

/** Asignar recursos: misma elegibilidad que editar, pero gobernada por su propio permiso. */
export function canAssignRow(row: RowStatusLike, permissions: Permissions, reportDate: string): boolean {
  return (
    permissions.canAssignResources &&
    row.status !== 'en_certificacion' &&
    (row.status !== 'ejecutado' || isReportToday(reportDate))
  );
}

/** Eliminar: solo si la fecha es hoy, futura, o el estado es sin_recursos_asignados. */
export function canDeleteRow(row: RowStatusLike, permissions: Permissions, reportDate: string): boolean {
  return (
    permissions.canDelete &&
    (isReportToday(reportDate) || isReportInFuture(reportDate) || row.status === 'sin_recursos_asignados')
  );
}
