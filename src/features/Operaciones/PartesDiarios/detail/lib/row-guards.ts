import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import type { BulkRowUpdateData } from '../mutations.server';
import type { Permissions } from '../columns/types';
import { toReportDateString } from './report-date';
import { RowRuleError, type RowErrorCode } from '../use-cases/errors';
import { assertStatusSettable as assertStatusSettableInTx } from '../use-cases/row-access';
import type { PrismaTransactionClient } from './row-query';
import { canAssignRow, canCreateRows, canDeleteRow, canEditRow } from './row-permissions';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/lib/row-guards');

/**
 * Guardas de servidor de las líneas del parte diario.
 *
 * La interfaz oculta los botones según permisos y estado (`row-permissions.ts`), pero una Server Action se puede
 * invocar sin pasar por la pantalla. Estas guardas aplican en el servidor LAS MISMAS reglas, llamando a las
 * mismas funciones puras que usa la interfaz: una regla, un lugar. No inventan reglas nuevas.
 *
 * Perímetro de empresa: lo resuelven los `assert*InCompany` de `perimeter.ts`; acá se vuelve a acotar por
 * empresa al leer, así una línea ajena nunca llega a evaluarse.
 *
 * Carreras: validar antes de la transacción no alcanza para `en_certificacion` (otro flujo puede pasar la línea a
 * ese estado en el medio). Por eso editar y eliminar vuelven a evaluar la regla DENTRO de la transacción, con la
 * fila bloqueada (`FOR UPDATE`): un cambio de estado concurrente espera a que esta transacción termine.
 */

export { RowRuleError };

const MODULE = 'operaciones';
const TAB = 'detalle-parte-diario';

async function loadPermissions(): Promise<Permissions> {
  const [canUpdate, canDelete, canAssignResources] = await Promise.all([
    checkPermissionServer(MODULE, TAB, 'update'),
    checkPermissionServer(MODULE, TAB, 'delete'),
    checkPermissionServer(MODULE, TAB, 'assign_resources'),
  ]);
  return { canUpdate, canDelete, canAssignResources };
}

interface RowContext {
  id: string;
  status: string;
  reportDate: string;
  /** Preparte vinculado hoy a la línea (para validar el perímetro solo cuando cambia). */
  preparteId: string | null;
}

async function loadRow(rowId: string, companyId: string): Promise<RowContext | null> {
  const row = await prisma.dailyreportrows.findFirst({
    where: { id: rowId, dailyreport: { company_id: companyId } },
    select: { id: true, status: true, preparte_id: true, dailyreport: { select: { date: true } } },
  });
  if (!row?.dailyreport) return null;
  return {
    id: row.id,
    status: row.status,
    reportDate: toReportDateString(row.dailyreport.date),
    preparteId: row.preparte_id,
  };
}

function deny(action: string, reason: string, code: RowErrorCode = 'FORBIDDEN'): never {
  logger.warn('Operación rechazada por reglas del parte diario', { data: { action, reason, code } });
  throw new RowRuleError(reason, code);
}

const NO_ROW = 'La línea del parte diario no existe o no pertenece a la empresa activa.';

/** Bloquea la línea hasta el fin de la transacción y devuelve su estado actual. */
async function lockRowStatus(tx: PrismaTransactionClient, rowId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM dailyreportrows WHERE id = ${rowId}::uuid FOR UPDATE`;
  const status = rows[0]?.status;
  if (!status) deny('lock', NO_ROW, 'NOT_FOUND');
  return status;
}

// ── Estado que se puede fijar al crear o editar ──────────────────────────────

/**
 * `en_certificacion` lo fija solo el flujo de certificación. El formulario nunca lo ofrece y `canEditRow` excluye
 * esas líneas, pero `resolveRowStatus` respeta cualquier estado terminal que llegue: sin esta guarda, una llamada
 * armada a mano mandaba una línea a certificación salteando ese flujo.
 */
export const assertStatusSettable = assertStatusSettableInTx;

// ── Crear ────────────────────────────────────────────────────────────────────

/** Crear una línea: permiso `update` y parte abierto o del día de hoy (igual que el botón "Nueva línea"). */
export async function authorizeRowCreate(dailyReportId: string, companyId: string): Promise<void> {
  const [permissions, report] = await Promise.all([
    loadPermissions(),
    prisma.dailyreport.findFirst({
      where: { id: dailyReportId, company_id: companyId },
      select: { status: true, date: true },
    }),
  ]);
  if (!report) deny('create', 'El parte diario no existe o no pertenece a la empresa activa.', 'NOT_FOUND');

  const allowed = canCreateRows({
    canUpdate: permissions.canUpdate,
    dailyReportStatus: report.status ?? 'abierto',
    reportDate: toReportDateString(report.date),
  });
  if (!allowed) {
    deny(
      'create',
      permissions.canUpdate
        ? 'No se pueden agregar líneas: el parte está cerrado y no es de hoy.'
        : 'No tenés permiso para agregar líneas al parte diario.'
    );
  }
}

// ── Editar ───────────────────────────────────────────────────────────────────

/**
 * - `'full'`: puede cambiar cualquier campo (permiso `update` y línea editable).
 * - `'resources'`: solo tiene `assign_resources`; el llamador debe aplicar únicamente los recursos y conservar
 *   los campos guardados (el formulario "Asignar recursos" tiene el resto bloqueado).
 */
export type RowUpdateScope = 'full' | 'resources';

export interface RowUpdateAuthorization {
  scope: RowUpdateScope;
  reportDate: string;
  /** Preparte guardado en la línea: el perímetro de empresa se valida solo si el pedido lo cambia. */
  preparteId: string | null;
}

export async function authorizeRowUpdate(rowId: string, companyId: string): Promise<RowUpdateAuthorization> {
  const [permissions, row] = await Promise.all([loadPermissions(), loadRow(rowId, companyId)]);
  if (!row) deny('update', NO_ROW, 'NOT_FOUND');

  const base = { reportDate: row.reportDate, preparteId: row.preparteId };
  if (canEditRow(row, permissions, row.reportDate)) return { scope: 'full', ...base };
  if (canAssignRow(row, permissions, row.reportDate)) return { scope: 'resources', ...base };

  deny(
    'update',
    permissions.canUpdate || permissions.canAssignResources
      ? 'La línea no se puede modificar: está en certificación o ya fue ejecutada en un parte anterior.'
      : 'No tenés permiso para modificar líneas del parte diario.'
  );
}

/** Dentro de la transacción: vuelve a evaluar que la línea siga siendo editable, con la fila bloqueada. */
export async function assertRowEditableUnderLock(
  tx: PrismaTransactionClient,
  rowId: string,
  authorization: RowUpdateAuthorization
): Promise<void> {
  const row = { status: await lockRowStatus(tx, rowId) };
  const stillAllowed =
    authorization.scope === 'full'
      ? canEditRow(row, { canUpdate: true, canDelete: false, canAssignResources: false }, authorization.reportDate)
      : canAssignRow(row, { canUpdate: false, canDelete: false, canAssignResources: true }, authorization.reportDate);
  if (!stillAllowed) deny('update', 'La línea cambió de estado y ya no se puede modificar. Actualizá la pantalla.');
}

// ── Eliminar ─────────────────────────────────────────────────────────────────

/** Eliminar una línea: permiso `delete` y parte de hoy o futuro, o línea sin recursos asignados. */
export async function authorizeRowDelete(rowId: string, companyId: string): Promise<{ reportDate: string }> {
  const [permissions, row] = await Promise.all([loadPermissions(), loadRow(rowId, companyId)]);
  if (!row) deny('delete', NO_ROW, 'NOT_FOUND');

  if (!canDeleteRow(row, permissions, row.reportDate)) {
    deny(
      'delete',
      permissions.canDelete
        ? 'La línea no se puede eliminar: el parte es de una fecha pasada y la línea tiene recursos asignados.'
        : 'No tenés permiso para eliminar líneas del parte diario.'
    );
  }
  return { reportDate: row.reportDate };
}

/** Dentro de la transacción: vuelve a evaluar la regla de eliminación con la fila bloqueada. */
export async function assertRowDeletableUnderLock(
  tx: PrismaTransactionClient,
  rowId: string,
  reportDate: string
): Promise<void> {
  const row = { status: await lockRowStatus(tx, rowId) };
  if (!canDeleteRow(row, { canUpdate: false, canDelete: true, canAssignResources: false }, reportDate)) {
    deny('delete', 'La línea cambió de estado y ya no se puede eliminar. Actualizá la pantalla.');
  }
}

// ── Edición masiva ───────────────────────────────────────────────────────────

/** Estados que ofrece el modal de edición masiva (`BASE_OPTIONS`); los pseudo-estados van aparte. */
const BULK_STATUSES = ['ejecutado', 'cancelado', 'reprogramado'] as const;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Edición masiva: permiso `update` y un pedido que el modal de la interfaz pueda generar (estado de la lista, o
 * completar turno; motivo si se cancela; fecha válida si se reprograma).
 *
 * Replica la interfaz tal cual: el modal no evalúa `canEditRow` por línea, así que acá tampoco. Si la edición
 * masiva debe respetar `en_certificacion` y "ejecutado salvo hoy" es una decisión de negocio pendiente (ver
 * `docs/arquitectura/LOOP-ESTADO.md`).
 */
export async function authorizeBulkRowUpdate(data: BulkRowUpdateData): Promise<void> {
  const permissions = await loadPermissions();
  if (!permissions.canUpdate) deny('bulk', 'No tenés permiso para modificar líneas del parte diario.');

  const completing = Boolean(data.completar_diurno || data.completar_nocturno);
  if (completing) {
    if (data.status !== undefined) deny('bulk', 'Pedido de edición masiva inválido.', 'INVALID_INPUT');
    return;
  }

  const status = data.status;
  if (!status || !(BULK_STATUSES as readonly string[]).includes(status)) {
    deny('bulk', 'Estado no permitido en la edición masiva.', 'INVALID_INPUT');
  }
  if (status === 'cancelado' && !data.cancel_reason?.trim()) {
    deny('bulk', 'Para cancelar hace falta indicar el motivo.', 'INVALID_INPUT');
  }
  if (status === 'reprogramado' && !(data.reschedule_date && ISO_DAY_RE.test(data.reschedule_date))) {
    deny('bulk', 'Para reprogramar hace falta una fecha destino válida.', 'INVALID_INPUT');
  }
}
