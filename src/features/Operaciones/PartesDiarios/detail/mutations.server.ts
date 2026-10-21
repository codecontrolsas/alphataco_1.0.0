'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { resolveRowQuantity } from '../lib/row-quantity';
import { reconcileRowResourceStatus } from '../lib/row-resource-status';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  assertDailyReportInCompany,
  assertRowInCompany,
  assertRowResourcesInCompany,
  filterRowsInCompany,
} from './lib/row-query';
import {
  assertRowDeletableUnderLock,
  assertRowEditableUnderLock,
  assertStatusSettable,
  authorizeBulkRowUpdate,
  authorizeRowCreate,
  authorizeRowDelete,
  authorizeRowUpdate,
  RowRuleError,
} from './lib/row-guards';
import { createRowRelations, type EmployeeInput } from './lib/row-relations';
import {
  buildResourceCheck,
  buildResourcesOnlyCheck,
  buildRowScalarData,
  resolveRowResources,
} from './lib/row-write-helpers';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/mutations');

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

// ── Input types ──────────────────────────────────────────────────────────────

/** Datos de una fila del parte diario para crear o actualizar */
export interface DailyReportRowInput {
  /** Requerido solo en create */
  daily_report_id?: string;
  customer_id: string;
  service_id: string;
  item_id: string;
  status: string;
  /**
   * Cantidad de la línea. Si no viene, vale 1 (`resolveRowQuantity`). Se acepta `string`
   * porque el input del formulario entrega texto y convertirlo a `number` antes de tiempo
   * pierde decimales: la conversión a `Decimal` la hace el helper.
   */
  quantity?: string | number | null;
  working_day: string;
  /** Turno seleccionado para jornada 12h (excluyente). Null para otras jornadas. */
  shift_12h?: 'dia' | 'noche' | null;
  type_service?: 'mensual' | 'adicional' | 'adicional_permanente' | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
  sector_service_id?: string | null;
  areas_service_id?: string | null;
  remit_number?: string | null;
  cancel_reason?: string | null;
  completed_day?: boolean | null;
  completed_night?: boolean | null;
  preparte_id?: string | null;
  employees?: EmployeeInput[];
  /** IDs de vehículos */
  equipment?: string[];
  /** IDs de otros equipos */
  other_equipment?: string[];
  /** IDs de equipos de clientes */
  customer_equipment?: string[];
}

/** Datos para edición masiva de filas */
export interface BulkRowUpdateData {
  status?: string;
  description?: string | null;
  /** Motivo de cancelación (requerido cuando status = 'cancelado') */
  cancel_reason?: string | null;
  /**
   * Fecha destino para reprogramación (YYYY-MM-DD).
   * Cuando se provee con status = 'reprogramado', se crean nuevas filas en esa fecha.
   */
  reschedule_date?: string | null;
  /**
   * Pseudo-estados que modifican completed_day / completed_night en lugar del status.
   * Se resuelven en bulkUpdateRowStatus y nunca se persisten como status.
   */
  completar_diurno?: boolean;
  completar_nocturno?: boolean;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Estado INICIAL de una línea al escribirla. Si el status enviado es terminal (ejecutado, cancelado,
 * reprogramado, en_certificacion) se respeta; si no, se parte de un estado provisional según haya o no
 * recursos. El estado definitivo de las líneas pendientes / sin recursos lo fija siempre
 * `reconcileRowResourceStatus` (fórmula única en SQL, con los flags del ítem) tras escribir las relaciones.
 *
 * NO se exporta: en un archivo `'use server'` todo lo exportado es una Server Action y tiene
 * que ser `async`, así que exportarla rompía `next build` ("Server Actions must be async
 * functions"). Su único llamador está en este mismo archivo.
 */
function resolveRowStatus(
  requestedStatus: string,
  hasResources: boolean
): 'pendiente' | 'sin_recursos_asignados' | 'ejecutado' | 'reprogramado' | 'cancelado' | 'en_certificacion' {
  const terminal = ['ejecutado', 'cancelado', 'reprogramado', 'en_certificacion'];
  if (terminal.includes(requestedStatus)) {
    return requestedStatus as 'ejecutado' | 'cancelado' | 'reprogramado' | 'en_certificacion';
  }
  return hasResources ? 'pendiente' : 'sin_recursos_asignados';
}

// ============================================================================
// 6. CREATE ROW
// ============================================================================

/**
 * Crea una nueva fila del parte diario con todas sus relaciones de forma atómica.
 * Calcula el status automáticamente según los recursos asignados.
 */
export async function createDailyReportRowPrisma(data: DailyReportRowInput & { daily_report_id: string }) {
  logger.debug('Creando fila del parte diario', { data: { daily_report_id: data.daily_report_id } });

  const resources = resolveRowResources(data);
  const { employees, equipment, otherEquipment, customerEquipment, hasResources } = resources;
  const resolvedStatus = resolveRowStatus(data.status, hasResources);

  try {
    // Perímetro: el parte y todos los recursos tienen que ser de la empresa activa.
    const companyId = await getActiveCompanyId();
    await assertDailyReportInCompany(data.daily_report_id, companyId);
    // Permiso y reglas de estado: las mismas que aplica la interfaz (ver `lib/row-guards.ts`).
    await authorizeRowCreate(data.daily_report_id, companyId);
    assertStatusSettable(data.status);
    await assertRowResourcesInCompany(companyId, buildResourceCheck(data, resources));

    const row = await withSessionActor(async (tx) => {
      const newRow = await tx.dailyreportrows.create({
        data: {
          id: crypto.randomUUID(),
          daily_report_id: data.daily_report_id,
          ...buildRowScalarData(data),
          quantity: resolveRowQuantity(data.quantity),
          status: resolvedStatus,
          type_service: data.type_service ?? null,
        },
      });

      await createRowRelations(tx, newRow.id, employees, equipment, otherEquipment, customerEquipment);
      await reconcileRowResourceStatus(tx, [newRow.id]);

      return newRow;
    });

    return row;
  } catch (error) {
    if (error instanceof RowRuleError) throw error;
    logger.error('Error al crear fila del parte diario', { data: { error } });
    throw new Error('No se pudo crear la fila del parte diario. Intente nuevamente.');
  }
}

export type CreateDailyReportRowResult = Awaited<ReturnType<typeof createDailyReportRowPrisma>>;

// ============================================================================
// 7. UPDATE ROW
// ============================================================================

/**
 * Actualiza una fila existente del parte diario y sincroniza todas sus relaciones
 * de forma atómica (delete + re-create).
 */
export async function updateDailyReportRowPrisma(rowId: string, data: DailyReportRowInput) {
  logger.debug('Actualizando fila del parte diario', { data: { rowId } });

  const resources = resolveRowResources(data);
  const { employees, equipment, otherEquipment, customerEquipment, hasResources } = resources;
  const resolvedStatus = resolveRowStatus(data.status, hasResources);

  try {
    // Perímetro: la línea y los recursos nuevos tienen que ser de la empresa activa.
    const companyId = await getActiveCompanyId();
    await assertRowInCompany(rowId, companyId);
    // Permiso y reglas de estado: las mismas que aplica la interfaz (ver `lib/row-guards.ts`).
    const authorization = await authorizeRowUpdate(rowId, companyId);
    // Con solo `assign_resources` (formulario "Asignar recursos", que tiene el resto bloqueado) se aplican los
    // recursos y se conservan los campos guardados: lo demás que llegue en el pedido se ignora por completo.
    const fullEdit = authorization.scope === 'full';
    if (fullEdit) assertStatusSettable(data.status);
    // El preparte solo se valida contra la empresa si el pedido lo CAMBIA: una línea vieja con un preparte sin
    // empresa cargada (`company_id` nulo) tiene que seguir pudiéndose editar.
    const preparteChanged = (data.preparte_id ?? null) !== authorization.preparteId;
    await assertRowResourcesInCompany(
      companyId,
      fullEdit
        ? { ...buildResourceCheck(data, resources), preparteId: preparteChanged ? data.preparte_id : null }
        : buildResourcesOnlyCheck(resources)
    );

    const row = await withSessionActor(async (tx) => {
      // 0. Volver a validar con la fila bloqueada: otro flujo pudo pasarla a certificación en el medio.
      await assertRowEditableUnderLock(tx, rowId, authorization);

      // 1. Actualizar la fila principal (solo con permiso de edición completa)
      const updatedRow = fullEdit
        ? await tx.dailyreportrows.update({
            where: { id: rowId },
            data: {
              ...buildRowScalarData(data),
              status: resolvedStatus,
              // No sobreescribir el tipo de servicio a null si el input no lo trae:
              // así una edición parcial (ej. asignar recursos) nunca borra un tipo ya guardado.
              ...(data.type_service != null ? { type_service: data.type_service } : {}),
            },
          })
        : null;

      // 2. Borrar todas las relaciones existentes
      await Promise.all([
        tx.dailyreportemployeerelations.deleteMany({
          where: { daily_report_row_id: rowId },
        }),
        tx.dailyreportequipmentrelations.deleteMany({
          where: { daily_report_row_id: rowId },
        }),
        tx.dailyreport_customer_equipment_relations.deleteMany({
          where: { daily_report_row_id: rowId },
        }),
      ]);

      // 3. Re-crear relaciones desde los nuevos datos
      await createRowRelations(tx, rowId, employees, equipment, otherEquipment, customerEquipment);
      await reconcileRowResourceStatus(tx, [rowId]);

      return updatedRow ?? tx.dailyreportrows.findUniqueOrThrow({ where: { id: rowId } });
    });

    return row;
  } catch (error) {
    if (error instanceof RowRuleError) throw error;
    logger.error('Error al actualizar fila del parte diario', { data: { error, rowId } });
    throw new Error('No se pudo actualizar la fila del parte diario. Intente nuevamente.');
  }
}

export type UpdateDailyReportRowResult = Awaited<ReturnType<typeof updateDailyReportRowPrisma>>;

// ============================================================================
// 8. DELETE ROW
// ============================================================================

/**
 * Elimina una fila del parte diario.
 * Si la fila tenía un preparte vinculado, revierte su estado a 'pendiente'
 * y registra el cambio en el log de auditoría del preparte.
 * Las relaciones (empleados, equipos) se eliminan en cascada por la BD.
 */
export async function deleteDailyReportRowPrisma(rowId: string) {
  logger.debug('Eliminando fila del parte diario', { data: { rowId } });

  try {
    // 1. Leer la fila (acotada a la empresa activa) para ver si tiene preparte vinculado
    const companyId = await getActiveCompanyId();
    const row = await prisma.dailyreportrows.findFirst({
      where: { id: rowId, dailyreport: { company_id: companyId } },
      select: {
        id: true,
        preparte_id: true,
        preparte: {
          select: { id: true, numero_pedido: true, status: true, company_id: true },
        },
      },
    });

    if (!row) {
      throw new Error('La fila no existe');
    }

    // Permiso y reglas de estado: las mismas que aplica la interfaz (ver `lib/row-guards.ts`).
    const { reportDate } = await authorizeRowDelete(rowId, companyId);

    // 2. Eliminar la fila (cascade elimina relaciones en BD). La regla se vuelve a evaluar con la fila bloqueada.
    await withSessionActor(async (tx) => {
      await assertRowDeletableUnderLock(tx, rowId, reportDate);
      return tx.dailyreportrows.delete({ where: { id: rowId } });
    });

    // 3. Si tenía preparte vinculado, revertir su estado a pendiente. Se revierte el de esta empresa o uno viejo sin
    //    empresa cargada; el de OTRA empresa no se toca.
    if (row.preparte && row.preparte.company_id && row.preparte.company_id !== companyId) {
      logger.warn('La línea tenía un preparte de otra empresa: no se revierte', { data: { rowId } });
    }
    if (row.preparte_id && row.preparte && (row.preparte.company_id === companyId || row.preparte.company_id === null)) {
      const { updatePreparte, logPreparteChange } = await import('@/features/Operaciones/Preparte/actions/mutations.server');

      await updatePreparte(row.preparte_id, { status: 'pendiente' });
      await logPreparteChange({
        preparte_id: row.preparte_id,
        field_name: 'status',
        old_value: row.preparte.status ?? 'confirmado',
        new_value: 'pendiente',
        reason: 'La línea del parte diario fue eliminada manualmente',
        metadata: { daily_report_row_id: rowId, action: 'daily_report_row_deleted' },
      });

      return {
        success: true,
        revertedPreparte: { numero_pedido: row.preparte.numero_pedido },
      };
    }

    return { success: true, revertedPreparte: null };
  } catch (error) {
    if (error instanceof RowRuleError) throw error;
    logger.error('Error al eliminar fila del parte diario', { data: { error, rowId } });
    throw new Error('No se pudo eliminar la fila del parte diario. Intente nuevamente.');
  }
}

export type DeleteDailyReportRowResult = Awaited<ReturnType<typeof deleteDailyReportRowPrisma>>;

// ============================================================================
// 9. BULK UPDATE ROW STATUS
// ============================================================================

/**
 * Actualiza múltiples filas del parte diario a la vez.
 * Útil para el modal de edición masiva (BulkEditModal).
 */
export async function bulkUpdateRowStatus(rowIds: string[], data: BulkRowUpdateData) {
  logger.debug('Actualizando múltiples filas del parte diario', {
    data: { count: rowIds.length, fields: Object.keys(data) },
  });

  if (rowIds.length === 0) {
    return { count: 0 };
  }

  try {
    // Permiso y pedido válido (lo que puede generar el modal de edición masiva): ver `lib/row-guards.ts`.
    await authorizeBulkRowUpdate(data);

    // Perímetro: se opera sólo sobre las líneas de la empresa activa.
    const companyId = await getActiveCompanyId();
    const allowedIds = await filterRowsInCompany(rowIds, companyId);
    if (allowedIds.length === 0) {
      throw new Error('Ninguna de las líneas seleccionadas pertenece a la empresa activa.');
    }
    rowIds = allowedIds;

    // ── Completar diurno: setea completed_day=true; si la noche ya estaba ────
    //    completa, promueve el status a 'ejecutado' (replicado de prod).
    if (data.completar_diurno || data.completar_nocturno) {
      const completandoDiurno = !!data.completar_diurno;
      const completandoNocturno = !!data.completar_nocturno;

      // Leer estado actual de cada fila para decidir promoción
      const currentRows = await prisma.dailyreportrows.findMany({
        where: { id: { in: rowIds } },
        select: { id: true, completed_day: true, completed_night: true, status: true },
      });

      await withSessionActor(async (tx) => {
        for (const row of currentRows) {
          const newCompletedDay = completandoDiurno ? true : row.completed_day;
          const newCompletedNight = completandoNocturno ? true : row.completed_night;
          const bothComplete = newCompletedDay === true && newCompletedNight === true;

          const updateData: Record<string, unknown> = {};
          if (completandoDiurno) updateData.completed_day = true;
          if (completandoNocturno) updateData.completed_night = true;
          if (bothComplete) updateData.status = 'ejecutado';

          await tx.dailyreportrows.update({
            where: { id: row.id },
            data: updateData,
          });
        }
      });
      return { count: currentRows.length };
    }

    // ── Reprogramado con fecha: clonar filas a destino + marcar origen ────────
    if (data.status === 'reprogramado' && data.reschedule_date) {
      // Import dinámico: `clone.server` importa helpers de este módulo (ciclo estático).
      const { cloneDailyReportRows } = await import('./clone.server');
      await cloneDailyReportRows(rowIds, [data.reschedule_date], {
        includeEmployees: false,
        includeEquipment: false,
      });
      await withSessionActor(async (tx) =>
        tx.dailyreportrows.updateMany({
          where: { id: { in: rowIds } },
          data: { status: 'reprogramado' },
        })
      );
      return { count: rowIds.length };
    }

    // ── Actualización normal ─────────────────────────────────────────────────
    const updatePayload: Record<string, unknown> = {};
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.cancel_reason !== undefined) updatePayload.cancel_reason = data.cancel_reason;

    const result = await withSessionActor(async (tx) => {
      const updated = await tx.dailyreportrows.updateMany({
        where: { id: { in: rowIds } },
        data: updatePayload,
      });
      // Pasar a 'pendiente' a mano no puede dejar una línea sin recursos como pendiente.
      if (data.status === 'pendiente' || data.status === 'sin_recursos_asignados') {
        await reconcileRowResourceStatus(tx, rowIds);
      }
      return updated;
    });

    return { count: result.count };
  } catch (error) {
    if (error instanceof RowRuleError) throw error;
    logger.error('Error al actualizar múltiples filas del parte diario', {
      data: { error, rowIds },
    });
    throw new Error('No se pudieron actualizar las filas del parte diario. Intente nuevamente.');
  }
}

export type BulkUpdateRowStatusResult = Awaited<ReturnType<typeof bulkUpdateRowStatus>>;

