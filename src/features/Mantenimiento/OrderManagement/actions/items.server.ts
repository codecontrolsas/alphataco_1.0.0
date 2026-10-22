'use server';

import { resolveWorkshopRejectionStatus } from '@/features/Mantenimiento/lib/order-status';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { getMaintenanceOrderCompanyId } from '@/features/Mantenimiento/shared/resource-company';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { lockEditableOrder, requireOrderManagementPermissions, toFailure } from './access';
import { applyChiefCommentUpdates, applyDescriptionUpdates, applyItemAdds, applyItemDeletes, applyRepairTypeUpdates, requiredActionsForChanges } from './item-changes';
import { orderChangeSetSchema, orderIdSchema, type OrderChangeSet } from '../schemas/order-changes';
import { z } from 'zod';
import { assertOrderInActiveCompany, assertSectorInCompany, assertWorkshopInCompany } from './perimeter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { assertOrderTransition } from '@/features/Mantenimiento/shared/order-transition';

const logger = new Logger('OrderManagement/items');

// =============================================================================
// BATCH SAVE
// =============================================================================

export type SaveOrderChangesResult =
  | { ok: true; repairTypes: { added: number; removed: number } }
  | { ok: false; message: string };

/**
 * Batch save: procesa todos los cambios pendientes en una sola accion.
 * Procesa en orden: deletes -> adds -> sector assignments -> repair type updates -> sequence updates.
 *
 * Permisos: cada tipo de cambio exige su acción (alta `create`, baja `delete`, resto `update`).
 * No admite edición en pedidos en estado terminal. Devuelve `{ ok: false, message }` ante rechazos
 * esperados (permisos/estado) para que el mensaje llegue al cliente aun en producción.
 */
export async function saveOrderChanges(orderId: string, rawChanges: OrderChangeSet): Promise<SaveOrderChangesResult> {
  try {
    orderIdSchema.parse(orderId);
    const changes = orderChangeSetSchema.parse(rawChanges);
    await requireOrderManagementPermissions(requiredActionsForChanges(changes));
    // Perímetro: el registro tiene que ser de la empresa activa.
    await assertOrderInActiveCompany(orderId);

    const profile = await requireServerAuthProfile();

    logger.info('Guardando cambios batch en orden', {
      data: {
        orderId,
        deletes: changes.deletes.length,
        adds: changes.adds.length,
        sectorAssignments: changes.sectorAssignments.length,
        repairTypeUpdates: changes.repairTypeUpdates.length,
        sequenceUpdates: changes.sequenceUpdates.length,
        descriptionUpdates: changes.descriptionUpdates.length,
        chiefCommentUpdates: changes.chiefCommentUpdates.length,
        workshopAssignments: changes.workshopAssignments.length,
      },
    });

    const repairTypes = await withMaintenanceActor(profile.id, async (tx) => {
      await lockEditableOrder(tx, orderId);
      const companyId = await getMaintenanceOrderCompanyId(tx, orderId);

      // 1. DELETES - Eliminar items manuales (atados al pedido validado).
      await applyItemDeletes(tx, orderId, changes.deletes);

      // 2. ADDS - Agregar nuevos items
      await applyItemAdds(tx, orderId, companyId, changes.adds);

      // 3. SECTOR ASSIGNMENTS
      // Backend safeguard: normalize sequence orders to avoid duplicates
      const existingSeqData = await tx.maintenance_order_items.findMany({
        where: {
          maintenance_order_id: orderId,
          work_order_id: { not: null },
          assigned_sector_id: { not: null },
          sector_sequence_order: { not: null },
        },
        select: { sector_sequence_order: true },
      });

      const maxExistingSeqBatch = existingSeqData.reduce(
        (max, item) => Math.max(max, item.sector_sequence_order ?? 0),
        0
      );

      // Normalize assignments: sort by their sequence order and re-assign sequential values
      const sortedAssignments = [...changes.sectorAssignments].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const normalizedAssignments = sortedAssignments.map((assignment, idx) => ({
        ...assignment,
        sequenceOrder: maxExistingSeqBatch + idx + 1,
      }));

      for (const assignment of normalizedAssignments) {
        await assertSectorInCompany(assignment.sectorId, companyId);

        await tx.maintenance_order_items.updateMany({
          where: { id: { in: assignment.itemIds }, maintenance_order_id: orderId },
          data: {
            assigned_sector_id: assignment.sectorId,
            sector_sequence_order: assignment.sequenceOrder,
            assigned_by: profile.id,
            assigned_at: new Date(),
          },
        });

        // Crear item DIAGNOSTICO si no existe para este sector
        const existingDiag = await tx.maintenance_order_items.findFirst({
          where: {
            maintenance_order_id: orderId,
            assigned_sector_id: assignment.sectorId,
            is_diagnostico: true,
          },
          select: { id: true },
        });

        if (!existingDiag) {
          await tx.maintenance_order_items.create({
            data: {
              maintenance_order_id: orderId,
              company_id: companyId,
              assigned_sector_id: assignment.sectorId,
              sector_sequence_order: assignment.sequenceOrder,
              is_diagnostico: true,
              description: 'DIAGNOSTICO',
              assigned_by: profile.id,
              assigned_at: new Date(),
            },
          });
        }
      }

      // 4. REPAIR TYPE UPDATES (altas y bajas explícitas)
      const repairTypeTotals = await applyRepairTypeUpdates(tx, orderId, companyId, changes.repairTypeUpdates);

      // 5. SEQUENCE ORDER UPDATES
      for (const seqUpdate of changes.sequenceUpdates) {
        await tx.maintenance_order_items.updateMany({
          where: { id: seqUpdate.itemId, maintenance_order_id: orderId },
          data: { sector_sequence_order: seqUpdate.sequenceOrder },
        });
      }

      // 6. DESCRIPTION UPDATES
      await applyDescriptionUpdates(tx, orderId, changes.descriptionUpdates);

      // 7. CHIEF COMMENT UPDATES
      await applyChiefCommentUpdates(tx, orderId, profile.id, changes.chiefCommentUpdates);

      // 8. EXTERNAL WORKSHOP ASSIGNMENTS (no sector, no diagnostico)
      for (const wsAssignment of changes.workshopAssignments) {
        await assertWorkshopInCompany(wsAssignment.workshopId, companyId);

        await tx.maintenance_order_items.updateMany({
          where: { id: { in: wsAssignment.itemIds }, maintenance_order_id: orderId },
          data: {
            assigned_workshop_id: wsAssignment.workshopId,
            assigned_sector_id: null,
            sector_sequence_order: null,
            assigned_by: profile.id,
            assigned_at: new Date(),
          },
        });
      }

      // 9. REJECTIONS - Marcar items como rechazados
      if (changes.rejections && changes.rejections.length > 0) {
        for (const rejection of changes.rejections) {
          await tx.maintenance_order_items.updateMany({
            where: { id: rejection.itemId, maintenance_order_id: orderId },
            data: {
              is_rejected: true,
              rejection_reason: rejection.reason,
              rejected_by: profile.id,
              rejected_at: new Date(),
            },
          });
        }
      }

      // 10. RESTORATIONS - Restaurar items rechazados
      if (changes.restorations && changes.restorations.length > 0) {
        await tx.maintenance_order_items.updateMany({
          where: { id: { in: changes.restorations }, maintenance_order_id: orderId },
          data: {
            is_rejected: false,
            rejection_reason: null,
            rejected_by: null,
            rejected_at: null,
          },
        });
      }

      // After rejections/restorations, check if order needs status transition
      if (
        (changes.rejections && changes.rejections.length > 0) ||
        (changes.restorations && changes.restorations.length > 0) ||
        changes.adds.length > 0
      ) {
        const currentOrder = await tx.maintenance_orders.findUnique({
          where: { id: orderId },
          select: { status: true },
        });

        const allItems = await tx.maintenance_order_items.findMany({
          where: { maintenance_order_id: orderId },
          select: { id: true, is_rejected: true, is_diagnostico: true },
        });

        const regularItems = allItems.filter((item) => !item.is_diagnostico);
        // Transición por rechazo/restauración de items: la regla vive en `lib/order-status.ts`.
        const nextStatus = resolveWorkshopRejectionStatus(currentOrder?.status ?? '', allItems);

        if (nextStatus === 'workshop_rejected') {
          // All items rejected → mark as workshop_rejected
          await assertOrderTransition(tx, orderId, 'workshop_rejected');
          await tx.maintenance_orders.update({
            where: { id: orderId },
            data: { status: 'workshop_rejected', updated_at: new Date() },
          });

          await logActivity(tx, {
            maintenanceOrderId: orderId,
            actionType: ACTIVITY_LOG.WORKSHOP_REJECTED_ALL_ITEMS,
            performedBy: profile.id,
            previousStatus: currentOrder?.status ?? 'in_workshop',
            newStatus: 'workshop_rejected',
            notes: `Todos los items rechazados por taller (${regularItems.length} item(s))`,
          });
        } else if (nextStatus === 'in_workshop') {
          // Some items restored or new items added → back to in_workshop
          await assertOrderTransition(tx, orderId, 'in_workshop');
          await tx.maintenance_orders.update({
            where: { id: orderId },
            data: { status: 'in_workshop', updated_at: new Date() },
          });

          await logActivity(tx, {
            maintenanceOrderId: orderId,
            actionType: ACTIVITY_LOG.WORKSHOP_RESTORED_FROM_REJECTED,
            performedBy: profile.id,
            previousStatus: 'workshop_rejected',
            newStatus: 'in_workshop',
            notes: 'Orden restaurada - items disponibles para gestionar',
          });
        }
      }

      // Grouped audit log: one entry capturing ALL changes from this save session
      const groupedMetadata: Record<string, unknown> = {};
      if (changes.deletes.length > 0) groupedMetadata.deletes = changes.deletes;
      if (changes.adds.length > 0) groupedMetadata.adds = changes.adds;
      if (changes.sectorAssignments.length > 0) groupedMetadata.sectorAssignments = changes.sectorAssignments;
      if (changes.repairTypeUpdates.length > 0) groupedMetadata.repairTypeUpdates = changes.repairTypeUpdates;
      if (changes.sequenceUpdates.length > 0) groupedMetadata.sequenceUpdates = changes.sequenceUpdates;
      if (changes.descriptionUpdates.length > 0) groupedMetadata.descriptionUpdates = changes.descriptionUpdates;
      if (changes.chiefCommentUpdates.length > 0) groupedMetadata.chiefCommentUpdates = changes.chiefCommentUpdates;
      if (changes.workshopAssignments.length > 0) groupedMetadata.workshopAssignments = changes.workshopAssignments;
      if (changes.rejections && changes.rejections.length > 0) groupedMetadata.rejections = changes.rejections;
      if (changes.restorations && changes.restorations.length > 0) groupedMetadata.restorations = changes.restorations;

      if (Object.keys(groupedMetadata).length > 0) {
        await logActivity(tx, {
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.ORDER_ITEMS_UPDATED,
          performedBy: profile.id,
          metadata: groupedMetadata,
        });
      }

      return repairTypeTotals;
    });

    logger.info('Cambios batch guardados exitosamente', { data: { orderId, ...repairTypes } });

    await invalidateCacheTags(INVALIDATION_MAP.saveOrderChanges);
    return { ok: true, repairTypes };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Los datos enviados son inválidos' };
    }
    logger.error('Error guardando cambios batch', { data: { error, orderId } });
    return toFailure(error);
  }
}

// =============================================================================
// GENERAR ORDENES DE TRABAJO
// =============================================================================
