'use server';

import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { assertRepairInScope } from '@/features/OperatorPanel/actions/perimeter';
import type { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';

/** Tope de texto libre (notas del técnico y motivo de devolución). */
const MAX_FREE_TEXT_LENGTH = 2000;
const repairIdSchema = z.string().uuid('Tarea inválida');
const notesSchema = z.string().max(MAX_FREE_TEXT_LENGTH, `Máximo ${MAX_FREE_TEXT_LENGTH} caracteres`);
const returnReasonSchema = z
  .string()
  .trim()
  .min(1, 'Indicá el motivo de la devolución')
  .max(MAX_FREE_TEXT_LENGTH, `Máximo ${MAX_FREE_TEXT_LENGTH} caracteres`);

type RepairStatus = Prisma.work_order_item_repairsWhereInput['status'];
type WorkOrderStatus = NonNullable<Prisma.work_ordersWhereInput['status']>;

/**
 * Estados desde los que cada acción es válida. Se verifican dos veces: antes (mensaje claro) y
 * DENTRO de la transacción, en el `where` del `updateMany`, para que dos requests simultáneos no
 * pisen una tarea que acaba de cambiar de estado ni toquen una OT cerrada o pausada.
 */
const OPEN_WORK_ORDER: WorkOrderStatus = { in: ['pending', 'in_progress', 'paused'] };
const WORKING_WORK_ORDER: WorkOrderStatus = { in: ['in_progress'] };
const OPEN_REPAIR: RepairStatus = { in: ['pending', 'in_progress'] };

/** `updateMany` con estado esperado de la tarea y de su OT; lanza si no actualizó nada. */
async function updateRepairGuarded(
  tx: Prisma.TransactionClient,
  repairId: string,
  expected: { repair: RepairStatus; workOrder: WorkOrderStatus; message: string },
  data: Prisma.work_order_item_repairsUncheckedUpdateManyInput
) {
  const result = await tx.work_order_item_repairs.updateMany({
    where: {
      id: repairId,
      status: expected.repair,
      work_order_items: { work_orders: { status: expected.workOrder } },
    },
    data,
  });
  if (result.count !== 1) throw new Error(expected.message);
}



/**
 * Tareas de una OT: completar, descompletar, notas del técnico y devolución al jefe de taller.
 *
 * Las cuatro recibían un `repairId` del cliente y escribían por ese id sin mirar nada más: sin
 * RLS, el id de una tarea de otro sector o de otra empresa entraba derecho.
 * `assertRepairInScope` lo resuelve por la OT a la que cuelga y lo contrasta contra los
 * sectores asignados al operario.
 *
 * La escritura y su entrada de historial van en una transacción con actor, así el
 * `performed_by` queda con el `profile.id` del operario (antes iba el id de sesión, que es un
 * `credential_id` y no existe como `profile.id` fuera de los datos heredados).
 */

/** Marca la tarea como completada. Requiere que la OT ya esté iniciada. */
export async function completeRepair(repairId: string) {
  repairIdSchema.parse(repairId);
  const { operator, repair } = await assertRepairInScope(repairId);

  if (repair.work_order_status === 'pending') {
    throw new Error('No se puede completar la tarea: primero debe iniciar la Orden de Trabajo');
  }
  if (repair.work_order_status !== 'in_progress') {
    throw new Error('No se puede completar la tarea: la Orden de Trabajo está pausada o cerrada');
  }

  await withMaintenanceActor(operator.profileId, async (tx) => {
    await updateRepairGuarded(
      tx,
      repairId,
      { repair: OPEN_REPAIR, workOrder: WORKING_WORK_ORDER, message: 'La tarea ya no se puede completar (cambió de estado)' },
      { status: 'completed', completed_at: new Date(), completed_by: operator.profileId }
    );

    await logActivity(tx, {
      workOrderId: repair.work_order_id,
      actionType: ACTIVITY_LOG.REPAIR_COMPLETED,
      performedBy: operator.profileId,
      metadata: { repairId, repairTypeName: repair.repair_type_name },
    });
  });
}

/** Vuelve la tarea a "en progreso" y borra la marca de completada. */
export async function uncompleteRepair(repairId: string) {
  repairIdSchema.parse(repairId);
  const { operator, repair } = await assertRepairInScope(repairId);

  await withMaintenanceActor(operator.profileId, async (tx) => {
    await updateRepairGuarded(
      tx,
      repairId,
      {
        repair: 'completed',
        workOrder: WORKING_WORK_ORDER,
        message: 'La tarea no está completada o la Orden de Trabajo no está en curso',
      },
      { status: 'in_progress', completed_at: null, completed_by: null }
    );

    await logActivity(tx, {
      workOrderId: repair.work_order_id,
      actionType: ACTIVITY_LOG.REPAIR_UNCOMPLETED,
      performedBy: operator.profileId,
      metadata: { repairId, repairTypeName: repair.repair_type_name },
    });
  });
}

/** Guarda las notas del técnico sobre la tarea. */
export async function updateTechnicianNotes(repairId: string, notes: string) {
  repairIdSchema.parse(repairId);
  const safeNotes = notesSchema.parse(notes);
  const { operator, repair } = await assertRepairInScope(repairId);

  await withMaintenanceActor(operator.profileId, async (tx) => {
    await updateRepairGuarded(
      tx,
      repairId,
      {
        repair: { in: ['pending', 'in_progress', 'completed'] },
        workOrder: OPEN_WORK_ORDER,
        message: 'No se pueden editar las notas: la tarea o la Orden de Trabajo están cerradas',
      },
      { technician_notes: safeNotes, technician_notes_by: operator.profileId }
    );

    await logActivity(tx, {
      workOrderId: repair.work_order_id,
      actionType: ACTIVITY_LOG.REPAIR_TECHNICIAN_NOTES_UPDATED,
      performedBy: operator.profileId,
      metadata: {
        repairId,
        repairTypeName: repair.repair_type_name,
        notesPreview: safeNotes.slice(0, 100),
      },
    });
  });
}

/** Devuelve la tarea al jefe de taller para que la reasigne. */
export async function returnTask(repairId: string, returnReason: string) {
  repairIdSchema.parse(repairId);
  const safeReason = returnReasonSchema.parse(returnReason);
  const { operator, repair } = await assertRepairInScope(repairId);

  await withMaintenanceActor(operator.profileId, async (tx) => {
    await updateRepairGuarded(
      tx,
      repairId,
      {
        repair: OPEN_REPAIR,
        workOrder: OPEN_WORK_ORDER,
        message: 'La tarea ya no se puede devolver (está completada o la Orden de Trabajo está cerrada)',
      },
      { status: 'reassignment_requested', return_reason: safeReason }
    );

    await logActivity(tx, {
      workOrderId: repair.work_order_id,
      actionType: ACTIVITY_LOG.REPAIR_RETURNED_TO_CHIEF,
      performedBy: operator.profileId,
      metadata: {
        repairId,
        repairTypeName: repair.repair_type_name,
        return_reason: safeReason,
      },
    });
  });
}
