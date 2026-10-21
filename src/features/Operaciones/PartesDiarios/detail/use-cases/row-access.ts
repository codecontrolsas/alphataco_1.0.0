import type { TenantContext, TenantTx } from '@/shared/lib/tenant-context';
import type { Permissions } from '../columns/types';
import { toReportDateString } from '../lib/report-date';
import { canAssignRow, canCreateRows, canEditRow } from '../lib/row-permissions';
import { RowRuleError } from './errors';

/**
 * Permisos, bloqueo y reglas de las líneas del parte para los casos de uso. Sin `next/*` ni sesión: el usuario y la
 * empresa vienen en el `TenantContext` y las reglas de estado son las funciones puras de `row-permissions.ts`
 * (las mismas que usa la interfaz).
 */

const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

/** Mismos permisos que `checkPermissionServer`, evaluados dentro de la transacción del comando. */
export async function loadRowPermissions(tx: TenantTx, ctx: TenantContext): Promise<Permissions> {
  if (!ctx.userId) throw new RowRuleError('Hace falta un usuario para modificar el parte diario.', 'FORBIDDEN');
  const rows = await tx.$queryRaw<{ can_update: boolean; can_delete: boolean; can_assign: boolean }[]>`
    SELECT
      user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'update') AS can_update,
      user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'delete') AS can_delete,
      user_has_permission(${ctx.userId}::uuid, ${ctx.companyId}::uuid, ${MODULE}, ${TAB}, 'assign_resources') AS can_assign`;
  const row = rows[0];
  return {
    canUpdate: row?.can_update === true,
    canDelete: row?.can_delete === true,
    canAssignResources: row?.can_assign === true,
  };
}

export interface LockedRow {
  id: string;
  status: string;
  version: number;
  reportDate: string;
  completedDay: boolean | null;
  completedNight: boolean | null;
}

/** Bloquea la línea (acotada a la empresa) hasta el fin de la transacción y devuelve su estado actual. */
export async function lockRow(tx: TenantTx, rowId: string, companyId: string): Promise<LockedRow> {
  const rows = await tx.$queryRaw<
    { id: string; status: string; version: number; date: Date; completed_day: boolean | null; completed_night: boolean | null }[]
  >`
    SELECT r.id, r.status::text AS status, r.version, d.date, r.completed_day, r.completed_night
    FROM dailyreportrows r JOIN dailyreport d ON d.id = r.daily_report_id
    WHERE r.id = ${rowId}::uuid AND d.company_id = ${companyId}::uuid
    FOR UPDATE OF r`;
  const row = rows[0];
  if (!row) throw new RowRuleError('La línea del parte diario no existe o no pertenece a la empresa activa.', 'NOT_FOUND');
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    reportDate: toReportDateString(row.date),
    completedDay: row.completed_day,
    completedNight: row.completed_night,
  };
}

/** La versión que vio quien envía el comando tiene que ser la vigente. */
export function assertBaseVersion(row: LockedRow, baseVersion: number): void {
  if (row.version !== baseVersion) {
    throw new RowRuleError(
      'La línea cambió mientras la editabas. Actualizá la pantalla y volvé a intentar.',
      'VERSION_CONFLICT',
      row.version
    );
  }
}

/** `en_certificacion` lo fija solo el flujo de certificación. */
export function assertStatusSettable(status: string): void {
  if (status === 'en_certificacion') {
    throw new RowRuleError('El estado "en certificación" solo lo asigna el flujo de certificación.', 'ROW_IN_CERTIFICATION');
  }
}

function explainNotEditable(row: LockedRow): never {
  if (row.status === 'en_certificacion') {
    throw new RowRuleError('La línea está en certificación y no se puede modificar.', 'ROW_IN_CERTIFICATION');
  }
  throw new RowRuleError('La línea ya fue ejecutada en un parte anterior y no se puede modificar.', 'ROW_EXECUTED_PAST');
}

/** Crear una línea: permiso `update` y parte abierto o de hoy. */
export function assertCanCreate(permissions: Permissions, report: { status: string; reportDate: string }): void {
  if (!permissions.canUpdate) throw new RowRuleError('No tenés permiso para agregar líneas al parte diario.', 'FORBIDDEN');
  if (!canCreateRows({ canUpdate: true, dailyReportStatus: report.status, reportDate: report.reportDate })) {
    throw new RowRuleError('No se pueden agregar líneas: el parte está cerrado y no es de hoy.', 'REPORT_CLOSED');
  }
}

/** Cambiar los recursos: permiso `assign_resources` (o `update`) y línea editable. */
export function assertCanChangeResources(permissions: Permissions, row: LockedRow): void {
  if (!permissions.canUpdate && !permissions.canAssignResources) {
    throw new RowRuleError('No tenés permiso para asignar recursos.', 'FORBIDDEN');
  }
  const asEditor = canEditRow(row, permissions, row.reportDate);
  const asAssigner = canAssignRow(row, permissions, row.reportDate);
  if (!asEditor && !asAssigner) explainNotEditable(row);
}

/** Cambiar el estado: permiso `update` y línea editable. */
export function assertCanChangeStatus(permissions: Permissions, row: LockedRow): void {
  if (!permissions.canUpdate) throw new RowRuleError('No tenés permiso para modificar líneas del parte diario.', 'FORBIDDEN');
  if (!canEditRow(row, permissions, row.reportDate)) explainNotEditable(row);
}
