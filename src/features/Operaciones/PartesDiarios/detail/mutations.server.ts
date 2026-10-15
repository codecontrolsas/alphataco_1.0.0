'use server';

import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { resolveRowQuantity } from '../lib/row-quantity';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  assertDailyReportInCompany,
  assertRowInCompany,
  assertRowResourcesInCompany,
  filterRowsInCompany,
  type PrismaTransactionClient,
} from './lib/row-query';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/mutations');

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

// ── Input types ──────────────────────────────────────────────────────────────

/** Un empleado con rol opcional (para jornadas 12/24 hrs) */
export interface EmployeeInput {
  id: string;
  role?: 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';
}

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
 * Determina el status automático de una fila según si tiene recursos asignados.
 * Si el status enviado es uno de los terminales (ejecutado, cancelado, reprogramado,
 * en_certificacion) lo respeta; si no, calcula pendiente / sin_recursos_asignados.
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

/**
 * Crea todas las relaciones (empleados, equipos, equipos de clientes)
 * de una fila dentro de una transacción existente.
 */
export async function createRowRelations(
  tx: PrismaTransactionClient,
  rowId: string,
  employees: EmployeeInput[],
  equipment: string[],
  otherEquipment: string[],
  customerEquipment: string[]
): Promise<void> {
  // Empleados
  if (employees.length > 0) {
    await tx.dailyreportemployeerelations.createMany({
      data: employees.map((emp) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        employee_id: emp.id,
        ...(emp.role ? { role: emp.role } : {}),
      })),
    });
  }

  // Vehículos + otros equipos (misma tabla, columnas distintas)
  const equipmentData: Array<{
    id: string;
    daily_report_row_id: string;
    equipment_id?: string;
    other_equipment_id?: string;
  }> = [
    ...equipment.map((eid) => ({
      id: crypto.randomUUID(),
      daily_report_row_id: rowId,
      equipment_id: eid,
    })),
    ...otherEquipment.map((oeid) => ({
      id: crypto.randomUUID(),
      daily_report_row_id: rowId,
      other_equipment_id: oeid,
    })),
  ];

  if (equipmentData.length > 0) {
    await tx.dailyreportequipmentrelations.createMany({ data: equipmentData });
  }

  // Equipos de clientes
  if (customerEquipment.length > 0) {
    await tx.dailyreport_customer_equipment_relations.createMany({
      data: customerEquipment.map((ceid) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        customer_equipment_id: ceid,
      })),
    });
  }
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

  const employees = data.employees ?? [];
  const equipment = data.equipment ?? [];
  const otherEquipment = data.other_equipment ?? [];
  const customerEquipment = data.customer_equipment ?? [];
  const hasResources = employees.length > 0 || equipment.length > 0 || otherEquipment.length > 0;
  const resolvedStatus = resolveRowStatus(data.status, hasResources);

  try {
    // Perímetro: el parte y todos los recursos tienen que ser de la empresa activa.
    const companyId = await getActiveCompanyId();
    await assertDailyReportInCompany(data.daily_report_id, companyId);
    await assertRowResourcesInCompany(companyId, {
      customerId: data.customer_id,
      serviceId: data.service_id,
      itemId: data.item_id,
      sectorServiceId: data.sector_service_id,
      areasServiceId: data.areas_service_id,
      employeeIds: employees.map((employee) => employee.id),
      equipmentIds: equipment,
      otherEquipmentIds: otherEquipment,
      customerEquipmentIds: customerEquipment,
    });

    const row = await withSessionActor(async (tx) => {
      const newRow = await tx.dailyreportrows.create({
        data: {
          id: crypto.randomUUID(),
          daily_report_id: data.daily_report_id,
          customer_id: data.customer_id,
          service_id: data.service_id,
          item_id: data.item_id,
          quantity: resolveRowQuantity(data.quantity),
          status: resolvedStatus,
          working_day: data.working_day,
          shift_12h: data.shift_12h ?? null,
          type_service: data.type_service ?? null,
          start_time: data.start_time ? new Date(`1970-01-01T${data.start_time}`) : null,
          end_time: data.end_time ? new Date(`1970-01-01T${data.end_time}`) : null,
          description: data.description ?? null,
          sector_service_id: data.sector_service_id ?? null,
          areas_service_id: data.areas_service_id ?? null,
          cancel_reason: data.cancel_reason ?? null,
          completed_day: data.completed_day ?? null,
          completed_night: data.completed_night ?? null,
          preparte_id: data.preparte_id ?? null,
        },
      });

      await createRowRelations(tx, newRow.id, employees, equipment, otherEquipment, customerEquipment);

      return newRow;
    });

    return row;
  } catch (error) {
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

  const employees = data.employees ?? [];
  const equipment = data.equipment ?? [];
  const otherEquipment = data.other_equipment ?? [];
  const customerEquipment = data.customer_equipment ?? [];
  const hasResources = employees.length > 0 || equipment.length > 0 || otherEquipment.length > 0;
  const resolvedStatus = resolveRowStatus(data.status, hasResources);

  try {
    // Perímetro: la línea y los recursos nuevos tienen que ser de la empresa activa.
    const companyId = await getActiveCompanyId();
    await assertRowInCompany(rowId, companyId);
    await assertRowResourcesInCompany(companyId, {
      customerId: data.customer_id,
      serviceId: data.service_id,
      itemId: data.item_id,
      sectorServiceId: data.sector_service_id,
      areasServiceId: data.areas_service_id,
      employeeIds: employees.map((employee) => employee.id),
      equipmentIds: equipment,
      otherEquipmentIds: otherEquipment,
      customerEquipmentIds: customerEquipment,
    });

    const row = await withSessionActor(async (tx) => {
      // 1. Actualizar la fila principal
      const updatedRow = await tx.dailyreportrows.update({
        where: { id: rowId },
        data: {
          customer_id: data.customer_id,
          service_id: data.service_id,
          item_id: data.item_id,
          status: resolvedStatus,
          working_day: data.working_day,
          shift_12h: data.shift_12h ?? null,
          // No sobreescribir el tipo de servicio a null si el input no lo trae:
          // así una edición parcial (ej. asignar recursos) nunca borra un tipo ya guardado.
          ...(data.type_service != null ? { type_service: data.type_service } : {}),
          start_time: data.start_time ? new Date(`1970-01-01T${data.start_time}`) : null,
          end_time: data.end_time ? new Date(`1970-01-01T${data.end_time}`) : null,
          description: data.description ?? null,
          sector_service_id: data.sector_service_id ?? null,
          areas_service_id: data.areas_service_id ?? null,
          cancel_reason: data.cancel_reason ?? null,
          completed_day: data.completed_day ?? null,
          completed_night: data.completed_night ?? null,
          preparte_id: data.preparte_id ?? null,
        },
      });

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

      return updatedRow;
    });

    return row;
  } catch (error) {
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
          select: { id: true, numero_pedido: true, status: true },
        },
      },
    });

    if (!row) {
      throw new Error('La fila no existe');
    }

    // 2. Eliminar la fila (cascade elimina relaciones en BD)
    await withSessionActor(async (tx) => tx.dailyreportrows.delete({ where: { id: rowId } }));

    // 3. Si tenía preparte vinculado, revertir su estado a pendiente
    if (row.preparte_id && row.preparte) {
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

    const result = await withSessionActor(async (tx) =>
      tx.dailyreportrows.updateMany({
        where: { id: { in: rowIds } },
        data: updatePayload,
      })
    );

    return { count: result.count };
  } catch (error) {
    logger.error('Error al actualizar múltiples filas del parte diario', {
      data: { error, rowIds },
    });
    throw new Error('No se pudieron actualizar las filas del parte diario. Intente nuevamente.');
  }
}

export type BulkUpdateRowStatusResult = Awaited<ReturnType<typeof bulkUpdateRowStatus>>;

