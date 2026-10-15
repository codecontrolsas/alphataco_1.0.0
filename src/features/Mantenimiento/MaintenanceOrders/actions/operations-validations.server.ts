'use server';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { resolveResourceConditionAfterClose } from '@/features/Mantenimiento/lib/order-status';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { transitionMaintenanceOrder } from '@/features/Mantenimiento/shared/order-transition';
import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile, requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { revalidatePath } from 'next/cache';
import { assertOrderInActiveCompany } from './order-perimeter';

const logger = new Logger('MaintenanceOrders/operations-validations');

/**
 * Validaciones de OPERACIONES sobre un pedido (cierre final y rechazos). Mismo criterio de
 * locks que `validations.server.ts`: pedido → OT. Permiso: `seguimiento_taller:update`.
 */

interface RejectionItem {
  repairId: string;
  comment: string;
}

/**
 * Operations validates order and marks as completed
 */
export async function operationsValidateOrder(orderId: string, notes?: string) {
  await requireMaintenancePermission('seguimiento_taller', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();

  logger.debug('Validando orden por operaciones', { data: { orderId, notes } });

  try {
    await withMaintenanceActor(profile.id, async (tx) => {
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      // Obtener equipment_id antes de actualizar
      const order = await tx.maintenance_orders.findUnique({
        where: { id: orderId },
        select: { equipment_id: true },
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }

      // Marcar la orden como completada
      await transitionMaintenanceOrder(tx, orderId, 'completed', {
        operations_validated_by: profile.id,
        operations_validated_at: new Date(),
        operations_validation_notes: notes ?? null,
        updated_at: new Date(),
      });

      // Condición del vehículo tras validación final: si el equipo todavía tiene
      // OTRA orden de mantenimiento dentro del taller (status in_workshop), sigue
      // no_operativo; solo vuelve a operativo cuando no le quedan órdenes en taller.
      if (order.equipment_id) {
        const remainingInWorkshop = await tx.maintenance_orders.count({
          where: {
            equipment_id: order.equipment_id,
            status: 'in_workshop',
            id: { not: orderId },
          },
        });
        const nextCondition = resolveResourceConditionAfterClose(remainingInWorkshop);
        await tx.vehicles.update({
          where: { id: order.equipment_id },
          data: { condition: nextCondition },
        });
        // `condition` es condición registrada de los tipos de documento de equipos: refresca el cache de status.
        await refreshDocumentStatus(tx, 'Equipos', { ids: [order.equipment_id] });
        logger.info('Condición del vehículo actualizada tras validación', {
          data: { equipmentId: order.equipment_id, nextCondition, remainingInWorkshop },
        });
      }

      // Audit log
      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.OPERATIONS_APPROVED,
        performedBy: profile.id,
        previousStatus: 'pending_operations_validation',
        newStatus: 'completed',
        notes: notes ?? 'Aprobado por operaciones - cierre final',
      });
    });

    logger.info('Orden validada por operaciones - cierre final', { data: { orderId, notes } });
    await invalidateCacheTags(INVALIDATION_MAP.operationsValidateOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al validar orden (operaciones)', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Operations rejects order and sends back to workshop chief (bulk - legacy)
 */
export async function operationsRejectOrder(orderId: string, reason: string) {
  await requireMaintenancePermission('seguimiento_taller', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);

  // Sin sesión el trigger de auditoría deja `performed_by` NULL, igual que antes.
  const profile = await getServerAuthProfile();
  logger.debug('Rechazando orden por operaciones (bulk)', { data: { orderId, reason } });

  try {
    await withMaintenanceActor(profile?.id ?? null, async (tx) => {
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      await transitionMaintenanceOrder(tx, orderId, 'pending_workshop_validation', {
        rejection_reason: reason,
        updated_at: new Date(),
      });
    });

    logger.info('Orden rechazada por operaciones', { data: { orderId, reason } });
    await invalidateCacheTags(INVALIDATION_MAP.operationsRejectOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al rechazar orden (operaciones)', { data: { error, orderId } });
    throw error;
  }
}


/**
 * Operations rejects specific items (granular).
 * - Sets order to 'operations_rejected'
 * - Does NOT change repair statuses (workshop chief decides)
 * - Logs to maintenance_activity_log with metadata
 */
export async function operationsRejectItems(orderId: string, rejections: RejectionItem[]) {
  await requireMaintenancePermission('seguimiento_taller', 'update');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  const profile = await requireServerAuthProfile();

  if (!rejections.length) throw new Error('Debe seleccionar al menos un item');

  logger.debug('Rechazando items por operaciones', { data: { orderId, count: rejections.length } });

  try {
    const repairIds = rejections.map((r) => r.repairId);

    // 1. Obtener detalles de repairs para metadata, atados a la orden ya validada.
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
      await lockMaintenanceOrder(tx, orderId); // pedido → OT (ver nota de locks arriba)

      // 2. Cambiar estado de la orden a operations_rejected
      await transitionMaintenanceOrder(tx, orderId, 'operations_rejected', { updated_at: new Date() });

      // 3. Construir metadata e insertar audit log
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
        actionType: ACTIVITY_LOG.OPERATIONS_ITEM_REJECTED,
        performedBy: profile.id,
        previousStatus: 'pending_operations_validation',
        newStatus: 'operations_rejected',
        notes: `${validRejections.length} item(s) rechazado(s) por operaciones`,
        metadata: { rejected_items: rejectedItems },
      });
    });

    logger.info('Items rechazados por operaciones', { data: { orderId, count: rejections.length } });
    await invalidateCacheTags(INVALIDATION_MAP.operationsRejectItems);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al rechazar items (operaciones)', { data: { error, orderId } });
    throw error;
  }
}

