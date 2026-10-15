'use server';

import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import {
  isValidApprovalDescription,
  normalizeApprovalDescription,
  resolveApprovalOutcome,
} from '@/features/Mantenimiento/lib/request-approval';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import type { ApproveRequestItemsInput } from '../../types';
import { assertRequestInActiveCompany, resolveRequestFromPending } from './request-perimeter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { assertSupervisorInCompany } from '@/features/Mantenimiento/shared/supervisor-perimeter';
import { z } from 'zod';

const serverLogger = new Logger('SolicitudesMantenimiento/approvals');

const idSchema = z.string().uuid('Identificador inválido');

const approveItemsSchema = z.object({
  requestId: idSchema,
  approvedItems: z.array(z.object({ itemId: idSchema, validatorComment: z.string().max(2000).optional() })).max(500),
  rejectedItems: z
    .array(z.object({ itemId: idSchema, reason: z.string().max(2000), validatorComment: z.string().max(2000).optional() }))
    .max(500),
});

const rejectItemsSchema = z.object({
  requestId: idSchema,
  itemIds: z.array(idSchema).max(500),
  reason: z.string().trim().min(1, 'El motivo del rechazo es obligatorio').max(2000),
});

/**
 * Aprueba items de una solicitud y crea el pedido de mantenimiento.
 *
 * NOTA: Los tipos de reparación NO se asignan en este paso.
 * Se asignan posteriormente en la etapa de Planificación (AsignarTallerDialog).
 */
export async function approveMaintenanceRequestItems(input: ApproveRequestItemsInput) {
  serverLogger.info('Aprobando items de solicitud', {
    data: {
      requestId: input.requestId,
      approvedCount: input.approvedItems.length,
      rejectedCount: input.rejectedItems.length,
    },
  });

  // Permiso: aprobar/denegar solicitudes es `update` de la tab de solicitudes.
  await requireMaintenancePermission('maintenance_requests', 'update');
  const parsedInput = approveItemsSchema.safeParse(input);
  if (!parsedInput.success) throw new Error(parsedInput.error.issues[0]?.message ?? 'Los datos enviados son inválidos');

  const profile = await requireServerAuthProfile();
  // Perímetro: la solicitud tiene que ser de la empresa activa.
  const companyId = await assertRequestInActiveCompany(input.requestId);

  // Descripción que verá el taller. Es obligatoria siempre que la aprobación
  // genere un pedido; la validación de longitud se repite acá porque el modal
  // no es la única barrera posible contra esta action.
  const description = normalizeApprovalDescription(input.description);

  function assertDescription() {
    if (!isValidApprovalDescription(description)) {
      throw new Error(
        `La descripción es obligatoria y debe tener al menos ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres`
      );
    }
  }

  // --- PREVENTIVE APPROVAL BRANCH ---
  if (input.preventiveApproval) {
    // Una aprobación preventiva siempre genera pedido.
    assertDescription();

    const request = await prisma.maintenance_requests.findFirstOrThrow({
      where: { id: input.requestId, company_id: companyId },
      select: {
        equipment_id: true,
        company_id: true,
        kilometer: true,
        engine_hours: true,
        source: true,
        preventive_type: true,
      },
    });

    await withMaintenanceActor(profile.id, async (tx) => {
      await resolveRequestFromPending(tx, input.requestId, companyId, 'approved', {
        approved_by: profile.id,
        approved_at: new Date(),
      });

      await tx.maintenance_orders.create({
        data: {
          maintenance_request_id: input.requestId,
          equipment_id: request.equipment_id,
          company_id: request.company_id,
          status: 'pending_scheduling',
          kilometer_at_entry: request.kilometer ?? null,
          source: request.source,
          preventive_type: request.preventive_type,
          description,
        },
      });

      await logActivity(tx, {
        maintenanceRequestId: input.requestId,
        actionType: ACTIVITY_LOG.REQUEST_APPROVED,
        performedBy: profile.id,
        notes: input.validatorComment || 'Solicitud preventiva aprobada',
        metadata: { source: 'preventive', preventive_type: request.preventive_type },
      });
    });

    await invalidateCacheTags(INVALIDATION_MAP.approveMaintenanceRequestItems);
    return;
  }
  // --- END PREVENTIVE BRANCH ---

  try {
    await withMaintenanceActor(profile.id, async (tx) => {
      // 1. Actualizar items aprobados (sin tipos de reparación).
      //    Los ids llegan del cliente: la escritura se ata a la solicitud ya validada
      //    (`updateMany`, que sí admite el where compuesto) para que un ítem de otra
      //    solicitud no entre por el endpoint.
      await Promise.all(
        input.approvedItems.map((item) =>
          tx.maintenance_request_items.updateMany({
            where: { id: item.itemId, maintenance_request_id: input.requestId },
            data: {
              status: 'approved',
              validator_comment: item.validatorComment ?? null,
              validator_comment_by: item.validatorComment ? profile.id : null,
            },
          })
        )
      );

      // 2. Actualizar items rechazados
      await Promise.all(
        input.rejectedItems.map((item) =>
          tx.maintenance_request_items.updateMany({
            where: { id: item.itemId, maintenance_request_id: input.requestId },
            data: {
              status: 'rejected',
              rejection_reason: item.reason,
              validator_comment: item.validatorComment ?? null,
              validator_comment_by: item.validatorComment ? profile.id : null,
            },
          })
        )
      );

      // 3. Obtener la solicitud para crear el pedido
      const request = await tx.maintenance_requests.findFirstOrThrow({
        where: { id: input.requestId, company_id: companyId },
        select: { id: true, equipment_id: true, company_id: true, kilometer: true },
      });

      // 4. Filtrar items "no propagables" según matriz checklist × item.
      //    Estos items SI quedan aprobados como maintenance_request_items (paso 1),
      //    pero NO generan maintenance_order_items, por lo que no llegan al taller.
      const approvedItemContexts = await tx.maintenance_request_items.findMany({
        where: { id: { in: input.approvedItems.map((i) => i.itemId) }, maintenance_request_id: input.requestId },
        select: {
          id: true,
          checklist_deviations: {
            select: {
              item_code: true,
              checklist_answers: { select: { template_id: true } },
            },
          },
        },
      });

      const propagatingItemIds = new Set(
        approvedItemContexts
          .filter(
            (ctx) =>
              !isNonPropagatingChecklistItem(
                ctx.checklist_deviations?.checklist_answers?.template_id ?? null,
                ctx.checklist_deviations?.item_code ?? null
              )
          )
          .map((ctx) => ctx.id)
      );

      // 5. Desenlace de la validación: qué ítems llegan al taller, si se crea el pedido y
      //    con qué estado queda la solicitud. La regla vive en `lib/request-approval.ts`.
      const outcome = resolveApprovalOutcome({
        approvedItemIds: input.approvedItems.map((i) => i.itemId),
        propagatingItemIds: [...propagatingItemIds],
        rejectedItems: input.rejectedItems,
      });

      if (outcome.skippedItemIds.length > 0) {
        serverLogger.info('Filtrando items no propagables al crear pedido', {
          data: {
            approved: input.approvedItems.length,
            propagating: outcome.orderItemIds.length,
            skipped: outcome.skippedItemIds.length,
          },
        });
      }

      const willCreateOrder = outcome.willCreateOrder;

      if (outcome.requiresDescription) {
        assertDescription();
      }

      if (outcome.requestStatus === 'rejected') {
        await resolveRequestFromPending(tx, input.requestId, companyId, 'rejected', {
          rejection_reason: outcome.rejectionReason,
          rejected_by: profile.id,
          rejected_at: new Date(),
        });
      } else {
        await resolveRequestFromPending(tx, input.requestId, companyId, 'approved', {
          approved_by: profile.id,
          approved_at: new Date(),
        });
      }

      // 6. Crear pedido de mantenimiento si hay items propagables
      if (willCreateOrder) {
        const order = await tx.maintenance_orders.create({
          data: {
            maintenance_request_id: input.requestId,
            equipment_id: request.equipment_id,
            company_id: request.company_id,
            status: 'pending_scheduling',
            kilometer_at_entry: request.kilometer ?? null,
            description,
          },
        });

        serverLogger.info('Pedido de mantenimiento creado', { data: { orderId: order.id } });

        // 7. Actualizar el kilometraje del vehículo si la solicitud tiene km.
        //    Solo aplica a vehículos: los equipamientos no llevan kilometraje.
        if (request.kilometer && request.equipment_id) {
          // Un try/catch dentro de la transacción no sirve: tras un error SQL la transacción queda
          // abortada. El contador solo avanza (nunca retrocede) y se ata a la empresa.
          const vehicle = await tx.vehicles.findFirst({
            where: { id: request.equipment_id, company_id: request.company_id },
            select: { kilometer: true },
          });
          const requested = Number(request.kilometer);
          if (vehicle && Number.isFinite(requested) && requested > Number(vehicle.kilometer ?? 0)) {
            await tx.vehicles.update({
              where: { id: request.equipment_id },
              data: { kilometer: request.kilometer },
            });
          }
        }

        // 8. Crear items del pedido SIN tipos de reparación
        await tx.maintenance_order_items.createMany({
          data: outcome.orderItemIds.map((itemId) => ({
            maintenance_order_id: order.id,
            company_id: request.company_id,
            maintenance_request_item_id: itemId,
            repair_type_id: null,
            is_critical: false,
          })),
        });
      }
    });

    await invalidateCacheTags(INVALIDATION_MAP.approveMaintenanceRequestItems);

    return { success: true };
  } catch (error) {
    serverLogger.error('Error al aprobar items de solicitud', { data: { error, requestId: input.requestId } });
    throw error;
  }
}

/**
 * Reasigna el supervisor de una solicitud de mantenimiento pendiente de aprobación.
 * Solo aplica a solicitudes en estado 'pending_approval'.
 */
export async function reassignRequestSupervisor(requestId: string, newSupervisorId: string) {
  await requireMaintenancePermission('maintenance_requests', 'update');
  const parsedIds = z.object({ requestId: idSchema, newSupervisorId: idSchema }).safeParse({ requestId, newSupervisorId });
  if (!parsedIds.success) throw new Error('Los datos enviados son inválidos');

  serverLogger.info('Reasignando supervisor de solicitud', {
    data: { requestId, newSupervisorId },
  });

  // Perímetro: la solicitud tiene que ser de la empresa activa y el supervisor, un usuario de ella.
  const companyId = await assertRequestInActiveCompany(requestId);
  await assertSupervisorInCompany(newSupervisorId, companyId);

  try {
    // Solo una solicitud pendiente de aprobación se reasigna (con el estado en el `where`).
    const result = await prisma.maintenance_requests.updateMany({
      where: { id: requestId, company_id: companyId, status: 'pending_approval' },
      data: { supervisor_id: newSupervisorId },
    });

    if (result.count !== 1) {
      throw new Error('Solo se puede reasignar el supervisor de una solicitud pendiente de aprobación');
    }

    serverLogger.info('Supervisor reasignado exitosamente', { data: { requestId, newSupervisorId } });

    await invalidateCacheTags(INVALIDATION_MAP.reassignRequestSupervisor);

    return { success: true };
  } catch (error) {
    serverLogger.error('Error al reasignar supervisor', { data: { error, requestId, newSupervisorId } });
    throw error;
  }
}

/**
 * Rechaza items específicos de una solicitud de mantenimiento.
 * Permite rechazo selectivo (item por item) con un motivo común.
 */
export async function rejectMaintenanceRequestItems(input: { requestId: string; itemIds: string[]; reason: string }) {
  serverLogger.info('Rechazando items de solicitud', {
    data: { requestId: input.requestId, itemCount: input.itemIds.length, reason: input.reason },
  });

  await requireMaintenancePermission('maintenance_requests', 'update');
  const parsedReject = rejectItemsSchema.safeParse(input);
  if (!parsedReject.success) throw new Error(parsedReject.error.issues[0]?.message ?? 'Los datos enviados son inválidos');

  const profile = await requireServerAuthProfile();
  // Perímetro: la solicitud tiene que ser de la empresa activa.
  const companyId = await assertRequestInActiveCompany(input.requestId);

  // --- PREVENTIVE REJECTION BRANCH ---
  if (input.itemIds.length === 0 && input.reason) {
    const request = await prisma.maintenance_requests.findFirstOrThrow({
      where: { id: input.requestId, company_id: companyId },
      select: { source: true, preventive_type: true },
    });

    if (request.source === 'preventive') {
      await withMaintenanceActor(profile.id, async (tx) => {
        await resolveRequestFromPending(tx, input.requestId, companyId, 'rejected', {
          rejection_reason: input.reason,
          rejected_by: profile.id,
          rejected_at: new Date(),
        });

        await logActivity(tx, {
          maintenanceRequestId: input.requestId,
          actionType: ACTIVITY_LOG.REJECTED,
          performedBy: profile.id,
          notes: input.reason,
          metadata: { source: 'preventive', preventive_type: request.preventive_type },
        });
      });

      await invalidateCacheTags(INVALIDATION_MAP.rejectMaintenanceRequestItems);
      return;
    }
  }
  // --- END PREVENTIVE BRANCH ---

  try {
    // La rama no preventiva escribía con `prisma` plano y sin registro de actividad: el rechazo
    // de ítems no aparecía en el historial del pedido (la rama preventiva de arriba sí lo
    // registra). Pasa a la misma transacción con actor que el resto del circuito.
    const { pendingItems, allRejected } = await withMaintenanceActor(profile.id, async (tx) => {
      // Actualizar solo los items seleccionados como rechazados
      await tx.maintenance_request_items.updateMany({
        where: { id: { in: input.itemIds }, maintenance_request_id: input.requestId },
        data: {
          status: 'rejected',
          rejection_reason: input.reason,
        },
      });

      // Verificar si quedan items pendientes en la solicitud
      const remainingItems = await tx.maintenance_request_items.findMany({
        where: { maintenance_request_id: input.requestId },
        select: { id: true, status: true },
      });

      const pending = remainingItems.filter((item) => item.status === 'pending');
      const everyRejected = remainingItems.length > 0 && remainingItems.every((item) => item.status === 'rejected');

      // Si todos los items están rechazados, actualizar el estado de la solicitud
      if (everyRejected) {
        await resolveRequestFromPending(tx, input.requestId, companyId, 'rejected', {
          rejection_reason: input.reason,
          rejected_by: profile.id,
          rejected_at: new Date(),
        });
      }

      await logActivity(tx, {
        maintenanceRequestId: input.requestId,
        actionType: ACTIVITY_LOG.REJECTED,
        performedBy: profile.id,
        newStatus: everyRejected ? 'rejected' : null,
        rejectionReason: input.reason,
        notes: everyRejected
          ? `${input.itemIds.length} ítem(s) rechazado(s): no quedan ítems aprobables`
          : `${input.itemIds.length} ítem(s) rechazado(s)`,
        metadata: {
          rejected_item_ids: input.itemIds,
          rejected_count: input.itemIds.length,
          pending_count: pending.length,
          all_rejected: everyRejected,
        },
      });

      return { pendingItems: pending, allRejected: everyRejected };
    });

    serverLogger.info('Items rechazados exitosamente', {
      data: {
        requestId: input.requestId,
        rejectedCount: input.itemIds.length,
        pendingCount: pendingItems.length,
        allRejected,
      },
    });

    await invalidateCacheTags(INVALIDATION_MAP.rejectMaintenanceRequestItems);

    return { success: true, pendingCount: pendingItems.length, allRejected };
  } catch (error) {
    serverLogger.error('Error al rechazar items de solicitud', { data: { error, requestId: input.requestId } });
    throw error;
  }
}
