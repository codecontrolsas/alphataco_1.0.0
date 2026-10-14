'use server';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { resolveResourceConditionAfterClose } from '@/features/Mantenimiento/lib/order-status';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { revalidatePath } from 'next/cache';
import { assertOrderInActiveCompany } from './order-perimeter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { transitionMaintenanceOrder } from '@/features/Mantenimiento/shared/order-transition';
import { assertSupervisorInCompany } from '@/features/Mantenimiento/shared/supervisor-perimeter';
import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';

const logger = new Logger('MaintenanceOrders/validations');

/**
 * Orden de locks de este archivo: **pedido → OT**, el mismo criterio que `OperatorPanel` y que
 * `mutations.server.ts` (ver `lockMaintenanceOrder`).
 *
 * Son 11 puntos de escritura: 8 sobre `maintenance_orders` (uno por transacción) y 3 sobre
 * `work_orders` (`workshopChiefReturnOrder`, `workshopChiefRejectItems` y la rama `agree` de
 * `workshopChiefHandleOperationsRejection`). Dos de esos tres escribían la OT ANTES del pedido,
 * o sea al revés que el panel del operario, que lockea el pedido primero: un jefe de taller
 * rechazando ítems y un operario cerrando su OT sobre el mismo pedido podían quedar
 * esperándose en cruz.
 *
 * Por eso TODAS las transacciones de acá abren con `lockMaintenanceOrder`. En las que sólo
 * escriben el pedido el lock ya lo tomaba el `update`; hacerlo explícito y primero deja el
 * invariante a la vista y lo vuelve inmune a que alguien reordene las escrituras.
 */

/**
 * Workshop chief validates order and sends to operations.
 * Also updates the supervisor assigned to the maintenance_request
 * so the correct operations supervisor receives the order for validation.
 */
export async function workshopChiefValidateOrder(orderId: string, notes?: string, operationsSupervisorId?: string) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  const companyId = await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();
  // El supervisor elegido llega del cliente: tiene que ser un usuario de la empresa.
  if (operationsSupervisorId) await assertSupervisorInCompany(operationsSupervisorId, companyId);

  logger.debug('Validando orden por jefe de taller', { data: { orderId, notes, operationsSupervisorId } });

  try {
    await withMaintenanceActor(profile.id, async (tx) => {
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      // El taller cierra el circuito: Operaciones ya no valida.
      // El cliente lo pidio explicitamente ("operaciones ya no tiene que dar mas el
      // ok de esto... ese paso se va, porque ellos mismos no lo hacen"): la orden
      // pasa de la validacion del taller directo a completada.
      const order = await tx.maintenance_orders.findUnique({
        where: { id: orderId },
        select: { equipment_id: true, other_equipment_id: true, maintenance_request_id: true },
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }

      await transitionMaintenanceOrder(tx, orderId, 'completed', {
        workshop_approved_by: profile.id,
        workshop_validated_at: new Date(),
        workshop_validation_notes: notes ?? null,
        // El cierre pasa a ser del taller, pero se siguen sellando estos campos
        // para no perder la trazabilidad de quien y cuando cerro.
        operations_validated_by: profile.id,
        operations_validated_at: new Date(),
        updated_at: new Date(),
      });

      // El recurso vuelve a operativo salvo que le queden OTRAS ordenes en taller.
      // Contempla vehiculos y equipamientos (ticket 596).
      const resourceId = order.equipment_id ?? order.other_equipment_id;
      if (resourceId) {
        const isOtherEquipment = order.other_equipment_id != null;
        const remainingInWorkshop = await tx.maintenance_orders.count({
          where: {
            ...(isOtherEquipment ? { other_equipment_id: resourceId } : { equipment_id: resourceId }),
            status: 'in_workshop',
            id: { not: orderId },
          },
        });
        const nextCondition = resolveResourceConditionAfterClose(remainingInWorkshop);

        if (isOtherEquipment) {
          await tx.other_equipment.update({ where: { id: resourceId }, data: { condition: nextCondition } });
        } else {
          await tx.vehicles.update({ where: { id: resourceId }, data: { condition: nextCondition } });
          // `condition` es condición registrada de los tipos de documento de equipos: refresca el cache de status.
          await refreshDocumentStatus(tx, 'Equipos', { ids: [resourceId] });
        }

        logger.info('Condición del recurso actualizada tras el cierre del taller', {
          data: { resourceId, isOtherEquipment, nextCondition, remainingInWorkshop },
        });
      }

      // Actualizar supervisor de operaciones en la maintenance_request asociada
      if (operationsSupervisorId) {
        if (order.maintenance_request_id) {
          await tx.maintenance_requests.update({
            where: { id: order.maintenance_request_id },
            data: { supervisor_id: operationsSupervisorId },
          });
          logger.info('Supervisor de operaciones actualizado en maintenance_request', {
            data: { requestId: order.maintenance_request_id, operationsSupervisorId },
          });
        } else {
          logger.warn('No se pudo obtener maintenance_request_id para actualizar supervisor', {
            data: { orderId },
          });
        }
      }

      // Audit log
      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.WORKSHOP_APPROVED,
        performedBy: profile.id,
        previousStatus: 'pending_workshop_validation',
        newStatus: 'completed',
        notes: notes ?? 'Cerrado por jefe de taller',
      });
    });

    logger.info('Orden validada por jefe de taller', { data: { orderId, notes, operationsSupervisorId } });
    await invalidateCacheTags(INVALIDATION_MAP.workshopChiefValidateOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al validar orden (workshop chief)', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Workshop chief returns order to workshop (reopens work orders)
 */
export async function workshopChiefReturnOrder(orderId: string, reason: string) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  if (!reason?.trim()) throw new Error('Debe indicar el motivo de la devolución');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();
  logger.debug('Devolviendo orden al taller', { data: { orderId, reason } });

  try {
    await withMaintenanceActor(profile.id, async (tx) => {
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      // 1. Actualizar estado de la orden a in_workshop
      await transitionMaintenanceOrder(tx, orderId, 'in_workshop', {
        rejection_reason: reason,
        updated_at: new Date(),
      });

      // 2. Buscar y reabrir OTs completadas/completadas parcial asociadas a la OM
      const workOrders = await tx.work_orders.findMany({
        where: {
          maintenance_order_items: {
            some: { maintenance_order_id: orderId },
          },
          status: { in: ['completed', 'completed_partial'] },
        },
        select: { id: true },
      });

      if (workOrders.length > 0) {
        await tx.work_orders.updateMany({
          where: { id: { in: workOrders.map((wo) => wo.id) } },
          data: { status: 'in_progress', updated_at: new Date() },
        });
      }

      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.WORKSHOP_RETURNED_ORDER,
        performedBy: profile.id,
        previousStatus: 'pending_workshop_validation',
        newStatus: 'in_workshop',
        rejectionReason: reason,
        metadata: { reopenedWorkOrderIds: workOrders.map((wo) => wo.id) },
      });
    });

    logger.info('Orden devuelta al taller', { data: { orderId, reason } });
    await invalidateCacheTags(INVALIDATION_MAP.workshopChiefReturnOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al devolver orden al taller', { data: { error, orderId } });
    throw error;
  }
}

// ============================================================================
// GRANULAR ITEM-LEVEL REJECTION ACTIONS
// ============================================================================

interface RejectionItem {
  repairId: string;
  comment: string;
}

/**
 * Workshop chief rejects specific repair items and sends back to operator.
 * - Sets selected repairs to status='rejected' with rejection_reason
 * - Reopens affected work orders to 'in_progress'
 * - Sets maintenance order back to 'in_workshop'
 * - Logs to maintenance_activity_log with metadata
 */
export async function workshopChiefRejectItems(orderId: string, rejections: RejectionItem[]) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();

  if (!rejections.length) throw new Error('Debe seleccionar al menos un item');

  logger.debug('Rechazando items por jefe de taller', { data: { orderId, count: rejections.length } });

  try {
    const repairIds = rejections.map((r) => r.repairId);

    // 1. Obtener detalles de repairs para metadata (nombre, sector).
    //    La lectura va ATADA a la orden ya validada: los `repairId` llegan del cliente y
    //    sin este filtro se podía rechazar una reparación de otra orden (u otra empresa).
    const repairDetails = await prisma.work_order_item_repairs.findMany({
      where: {
        id: { in: repairIds },
        work_order_items: { maintenance_order_items: { maintenance_order_id: orderId } },
      },
      select: {
        id: true,
        types_of_repairs: { select: { id: true, name: true } },
        work_order_items: {
          select: {
            id: true,
            work_order_id: true,
            maintenance_order_items: {
              select: {
                id: true,
                assigned_sector_id: true,
                workshop_sectors: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const validRepairIds = new Set(repairDetails.map((repair) => repair.id));
    const validRejections = rejections.filter((rejection) => validRepairIds.has(rejection.repairId));

    if (validRejections.length === 0) throw new Error('Ningún ítem seleccionado pertenece a esta orden');

    await withMaintenanceActor(profile.id, async (tx) => {
      // Orden invertido hasta la Task 13b: esta ruta escribía las reparaciones y las OTs y
      // recién al final el pedido, mientras `OperatorPanel` lockea el pedido primero.
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      // 2. Marcar cada repair como rechazado con comentario individual
      for (const rejection of validRejections) {
        await tx.work_order_item_repairs.update({
          where: { id: rejection.repairId },
          data: {
            status: 'rejected',
            rejection_reason: rejection.comment,
            updated_at: new Date(),
          },
        });
      }

      // 3. Reabrir OTs afectadas
      const affectedWoIds = new Set<string>();
      repairDetails.forEach((repair) => {
        affectedWoIds.add(repair.work_order_items.work_order_id);
      });

      if (affectedWoIds.size > 0) {
        await tx.work_orders.updateMany({
          where: { id: { in: Array.from(affectedWoIds) } },
          data: { status: 'in_progress', updated_at: new Date() },
        });
      }

      // 4. Volver la OM a in_workshop
      await transitionMaintenanceOrder(tx, orderId, 'in_workshop', { updated_at: new Date() });

      // 5. Construir metadata e insertar audit log
      const rejectedItems = validRejections.map((rejection) => {
        const detail = repairDetails.find((r) => r.id === rejection.repairId);
        return {
          repair_id: rejection.repairId,
          repair_name: detail?.types_of_repairs?.name ?? 'Sin nombre',
          sector_name: detail?.work_order_items?.maintenance_order_items?.workshop_sectors?.name ?? 'Sin sector',
          comment: rejection.comment,
        };
      });

      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.WORKSHOP_ITEM_REJECTED,
        performedBy: profile.id,
        previousStatus: 'pending_workshop_validation',
        newStatus: 'in_workshop',
        notes: `${validRejections.length} item(s) rechazado(s) por jefe de taller`,
        metadata: { rejected_items: rejectedItems },
      });
    });

    logger.info('Items rechazados por jefe de taller', { data: { orderId, count: rejections.length } });
    await invalidateCacheTags(INVALIDATION_MAP.workshopChiefRejectItems);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al rechazar items (workshop chief)', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Workshop chief handles operations rejection.
 * - If agree: marks repairs as rejected, reopens WOs, sets order to in_workshop
 * - If disagree: sends back to pending_operations_validation
 */
export async function workshopChiefHandleOperationsRejection(orderId: string, agree: boolean, comment?: string) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();

  logger.debug('Jefe de taller manejando rechazo de operaciones', { data: { orderId, agree, comment } });

  try {
    if (agree) {
      // Leer el último log de operations_item_rejected para obtener los IDs de repairs
      const lastLog = await prisma.maintenance_activity_log.findFirst({
        where: {
          maintenance_order_id: orderId,
          action_type: 'operations_item_rejected',
        },
        orderBy: { performed_at: 'desc' },
        select: { metadata: true },
      });

      const metadata = lastLog?.metadata as { rejected_items?: Array<{ repair_id: string; comment: string }> } | null;
      const rejectedItems = metadata?.rejected_items ?? [];

      if (rejectedItems.length === 0) {
        throw new Error('No se encontraron items rechazados por operaciones');
      }

      const repairIds = rejectedItems.map((item) => item.repair_id);

      await withMaintenanceActor(profile.id, async (tx) => {
        // Mismo caso que `workshopChiefRejectItems`: escribía reparaciones y OTs antes del
        // pedido. El lock del pedido va primero (ver nota de locks arriba).
        await lockMaintenanceOrder(tx, orderId);

        // Marcar repairs como rechazados
        for (const item of rejectedItems) {
          // Atado a la orden: los ids salen del log, pero no se confía en ellos para escribir.
          await tx.work_order_item_repairs.updateMany({
            where: {
              id: item.repair_id,
              work_order_items: { maintenance_order_items: { maintenance_order_id: orderId } },
            },
            data: {
              status: 'rejected',
              rejection_reason: item.comment,
              updated_at: new Date(),
            },
          });
        }

        // Obtener WOs afectadas y reabrirlas
        const affectedRepairs = await tx.work_order_item_repairs.findMany({
          where: {
            id: { in: repairIds },
            work_order_items: { maintenance_order_items: { maintenance_order_id: orderId } },
          },
          select: { work_order_items: { select: { work_order_id: true } } },
        });

        const affectedWoIds = new Set<string>();
        affectedRepairs.forEach((repair) => {
          affectedWoIds.add(repair.work_order_items.work_order_id);
        });

        if (affectedWoIds.size > 0) {
          await tx.work_orders.updateMany({
            where: { id: { in: Array.from(affectedWoIds) } },
            data: { status: 'in_progress', updated_at: new Date() },
          });
        }

        // Volver la orden a in_workshop
        await transitionMaintenanceOrder(tx, orderId, 'in_workshop', { updated_at: new Date() });

        // Audit log
        await logActivity(tx, {
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.WORKSHOP_AGREED_OPS_REJECTION,
          performedBy: profile.id,
          previousStatus: 'operations_rejected',
          newStatus: 'in_workshop',
          notes: comment ?? 'Jefe de taller de acuerdo con rechazo de operaciones',
          metadata: { original_rejected_items: rejectedItems },
        });
      });

      logger.info('Jefe de taller de acuerdo con rechazo de operaciones', { data: { orderId } });
    } else {
      // Desacuerdo — enviar de vuelta a operaciones
      if (!comment?.trim()) throw new Error('Debe indicar el motivo de desacuerdo');

      await withMaintenanceActor(profile.id, async (tx) => {
        await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

        await transitionMaintenanceOrder(tx, orderId, 'pending_operations_validation', { updated_at: new Date() });

        await logActivity(tx, {
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.WORKSHOP_DISAGREED_OPS_REJECTION,
          performedBy: profile.id,
          previousStatus: 'operations_rejected',
          newStatus: 'pending_operations_validation',
          notes: comment,
        });
      });

      logger.info('Jefe de taller en desacuerdo con rechazo de operaciones', { data: { orderId, comment } });
    }

    await invalidateCacheTags(INVALIDATION_MAP.workshopChiefHandleOperationsRejection);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al manejar rechazo de operaciones (workshop chief)', { data: { error, orderId } });
    throw error;
  }
}
