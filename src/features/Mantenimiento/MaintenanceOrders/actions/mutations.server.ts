'use server';

import { areAllWorkOrdersClosed } from '@/features/Mantenimiento/lib/order-status';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { logWorkOrderCompletedOnMaintenanceOrder } from '@/features/Mantenimiento/shared/activity-log/log-work-order-completed';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { revalidatePath } from 'next/cache';
import { assertOrderInActiveCompany, assertWorkOrderInActiveCompany } from './order-perimeter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { transitionMaintenanceOrder } from '@/features/Mantenimiento/shared/order-transition';
import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { z } from 'zod';

const logger = new Logger('MaintenanceOrders/mutations');

const sectorOrdersSchema = z
  .array(z.object({ sectorId: z.string().uuid(), sequenceOrder: z.number().int().min(0).max(1000) }))
  .min(1)
  .max(200);

/**
 * Actualiza el orden de ejecucion de los sectores (OTs) dentro de una OM.
 * Solo se puede modificar cuando la OM esta en estado in_workshop.
 * Recibe un array de { sectorId, sequenceOrder } y actualiza todos los
 * maintenance_order_items de cada sector con el nuevo orden.
 */
export async function updateSectorExecutionOrder(
  orderId: string,
  sectorOrders: Array<{ sectorId: string; sequenceOrder: number }>
) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  const parsedOrders = sectorOrdersSchema.safeParse(sectorOrders);
  if (!parsedOrders.success) throw new Error('El orden de sectores es inválido');

  const profile = await requireServerAuthProfile();
  logger.debug('Actualizando orden de ejecucion de sectores', { data: { orderId, sectorOrders } });

  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOrderInActiveCompany(orderId);

  try {
    await withMaintenanceActor(profile.id, async (tx) => {
      // El estado se lee con el pedido lockeado: no puede salir de taller entre el chequeo y la escritura.
      await lockMaintenanceOrder(tx, orderId);
      const order = await tx.maintenance_orders.findUnique({
        where: { id: orderId },
        select: { status: true },
      });

      if (!order) {
        throw new Error('No se encontró la orden de mantenimiento');
      }

      if (order.status !== 'in_workshop') {
        throw new Error('Solo se puede cambiar el orden cuando la OM está en taller');
      }

      for (const { sectorId, sequenceOrder } of parsedOrders.data) {
        await tx.maintenance_order_items.updateMany({
          where: {
            maintenance_order_id: orderId,
            assigned_sector_id: sectorId,
          },
          data: { sector_sequence_order: sequenceOrder },
        });
      }

      await logActivity(tx, {
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.SECTOR_EXECUTION_ORDER_UPDATED,
        performedBy: profile.id,
        metadata: { sectorOrders: parsedOrders.data },
      });
    });

    logger.info('Orden de ejecucion de sectores actualizado', { data: { orderId, sectorOrders } });
    await invalidateCacheTags(INVALIDATION_MAP.updateSectorExecutionOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al actualizar orden de sector', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Completa manualmente una OT de taller externo
 */
export async function completeExternalWorkOrder(workOrderId: string) {
  await requireMaintenancePermission('ordenes_mantenimiento', 'update');
  // Perímetro: la OT tiene que ser de la empresa activa.
  const companyId = await assertWorkOrderInActiveCompany(workOrderId);
  logger.debug('Completando OT externa', { data: { workOrderId } });

  // Cerrar una OT es una acción de usuario: sin sesión no hay autor del cierre.
  const profile = await requireServerAuthProfile();
  const profileId = profile.id;

  try {
    const maintenanceOrderId = await withMaintenanceActor(profileId, async (tx) => {
      // Orden de locks pedido → OT (`lockMaintenanceOrder`): el pedido se resuelve y se lockea
      // ANTES de tocar la OT. Antes esta ruta escribía la OT primero y llegaba al pedido al
      // final, o sea al revés que `OperatorPanel`: un cierre externo y un cierre de operario
      // sobre el mismo pedido podían quedar esperándose en cruz.
      const woItem = await tx.work_order_items.findFirst({
        where: { work_order_id: workOrderId },
        select: {
          maintenance_order_items: { select: { maintenance_order_id: true } },
        },
      });

      const maintenanceOrderId = woItem?.maintenance_order_items?.maintenance_order_id ?? null;

      if (maintenanceOrderId) await lockMaintenanceOrder(tx, maintenanceOrderId);

      // Completar la OT: solo si sigue abierta (con el estado en el `where`, un doble click o un
      // cierre concurrente no la vuelve a escribir ni duplica el registro de actividad).
      const closed = await tx.work_orders.updateMany({
        where: { id: workOrderId, company_id: companyId, status: { notIn: ['completed', 'completed_partial', 'cancelled'] } },
        data: {
          status: 'completed',
          completed_at: new Date(),
          completed_by: profileId,
        },
      });

      if (closed.count !== 1) {
        throw new Error('La orden de trabajo ya está cerrada o cancelada');
      }

      await logActivity(tx, {
        workOrderId: workOrderId,
        actionType: ACTIVITY_LOG.EXTERNAL_WO_COMPLETED,
        performedBy: profileId,
        newStatus: 'completed',
        metadata: { closedAt: new Date().toISOString() },
      });

      if (maintenanceOrderId) {
        // Verificar si todas las OTs de la OM están cerradas
        const allItems = await tx.maintenance_order_items.findMany({
          where: { maintenance_order_id: maintenanceOrderId },
          select: {
            work_orders: { select: { id: true, status: true } },
          },
        });

        const allWOs = allItems
          .map((item) => item.work_orders)
          .filter((wo): wo is NonNullable<typeof wo> => wo !== null);

        const allClosed = areAllWorkOrdersClosed(allWOs.map((wo) => wo.status));

        if (allClosed) {
          await transitionMaintenanceOrder(tx, maintenanceOrderId, 'pending_workshop_validation');

          logger.info('Maintenance order ready for workshop validation (external WO completed)', {
            data: { maintenanceOrderId, workOrderId },
          });

          await logActivity(tx, {
            maintenanceOrderId: maintenanceOrderId,
            actionType: ACTIVITY_LOG.EXTERNAL_WO_COMPLETED,
            performedBy: profileId,
            previousStatus: 'in_workshop',
            newStatus: 'pending_workshop_validation',
            metadata: { triggeredByWorkOrderId: workOrderId },
          });
        }
      }

      return maintenanceOrderId;
    });

    // El historial del pedido filtra por maintenance_order_id, asi que sin este registro el
    // cierre de una OT de taller EXTERNO no aparecia en el historial (solo quedaba anotado
    // contra la OT). Va FUERA de la transaccion: es un registro secundario que nunca debe
    // poder abortar el cierre -- ver el comentario de la funcion.
    if (maintenanceOrderId) {
      await logWorkOrderCompletedOnMaintenanceOrder({
        workOrderId,
        finalStatus: 'completed',
        performedBy: profileId,
        maintenanceOrderId,
      });
    }

    logger.info('OT externa completada', { data: { workOrderId } });
    await invalidateCacheTags(INVALIDATION_MAP.completeExternalWorkOrder);
    revalidatePath('/dashboard/maintenance');
  } catch (error) {
    logger.error('Error al completar OT externa', { data: { error, workOrderId } });
    throw error;
  }
}
