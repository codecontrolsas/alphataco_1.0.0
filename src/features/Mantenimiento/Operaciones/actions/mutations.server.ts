'use server';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { checkMultiplePermissionsServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import type { ApproveWorkshopEntryInput, RejectOperationInput } from '../../types';
import { assertOperationOrderInActiveCompany } from './perimeter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { assertOrderTransition } from '@/features/Mantenimiento/shared/order-transition';

const serverLogger = new Logger('Operaciones/mutations');

/** Exige `update` en alguna de las tabs desde las que se opera el pedido (Seguimiento es la principal). */
async function requireOperationUpdate(tabSlugs: readonly string[]) {
  const granted = await checkMultiplePermissionsServer(
    tabSlugs.map((tabSlug) => ({ moduleSlug: 'mantenimiento', tabSlug, actionSlug: 'update' }))
  );
  if (![...granted.values()].some(Boolean)) throw new Error('No tenés permiso para operar pedidos de mantenimiento');
}

/**
 * Rechaza una operación y la devuelve al estado de pedido pendiente
 */
export async function rejectMaintenanceOperation(input: RejectOperationInput) {
  await requireOperationUpdate(['seguimiento_taller', 'maintenance_orders', 'pedidos_pendientes']);
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOperationOrderInActiveCompany(input.orderId);

  const profile = await requireServerAuthProfile();

  serverLogger.info('Rechazando operación', { data: { orderId: input.orderId, reason: input.reason } });

  try {
    const data = await withMaintenanceActor(profile.id, async (tx) => {
      await assertOrderTransition(tx, input.orderId, 'pending_scheduling');
      return tx.maintenance_orders.update({
        where: { id: input.orderId },
        data: {
          status: 'pending_scheduling',
          // Resetear campos de programación a NULL
          scheduled_date: null,
          scheduled_by: null,
          scheduled_at: null,
          rejection_reason: input.reason,
          rejected_by: profile.id,
          rejected_at: new Date(),
        },
      });
    });

    serverLogger.info('Operación rechazada, vuelve a pedido pendiente', { data: { orderId: input.orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.rejectMaintenanceOperation);

    return data;
  } catch (error) {
    serverLogger.error('Error al rechazar operación', { data: { error, orderId: input.orderId } });
    throw error;
  }
}

/**
 * Aprueba la entrada al taller y actualiza el kilometraje y condición del equipo.
 * Usa transacción atómica para garantizar consistencia entre order y vehicle.
 */
export async function approveWorkshopEntry(input: ApproveWorkshopEntryInput) {
  await requireOperationUpdate([
    'seguimiento_taller',
    'maintenance_requests',
    'maintenance_orders',
    'pedidos_confirmados',
  ]);
  // Perímetro: el pedido tiene que ser de la empresa activa.
  await assertOperationOrderInActiveCompany(input.orderId);

  const profile = await requireServerAuthProfile();

  serverLogger.info('Aprobando entrada a taller', { data: { orderId: input.orderId, kilometer: input.kilometer } });

  try {
    // Usar transacción para garantizar atomicidad entre update order + update vehicle
    const result = await withMaintenanceActor(profile.id, async (tx) => {
      // Obtener el pedido para saber el equipment_id
      const order = await tx.maintenance_orders.findUnique({
        where: { id: input.orderId },
        select: { equipment_id: true, other_equipment_id: true },
      });

      if (!order) {
        throw new Error(`Pedido ${input.orderId} no encontrado`);
      }

      // Actualizar el pedido
      await assertOrderTransition(tx, input.orderId, 'in_workshop');
      await tx.maintenance_orders.update({
        where: { id: input.orderId },
        data: {
          status: 'in_workshop',
          workshop_entry_date: new Date(),
          workshop_approved_by: profile.id,
          kilometer_at_entry: input.kilometer,
        },
      });

      // Actualizar el recurso: condición a 'no_operativo' y kilometraje.
      // El pedido es de un vehículo o de un equipamiento (ticket 596); los
      // equipamientos no llevan kilometraje, solo cambian de condición.
      if (order.equipment_id) {
        await tx.vehicles.update({
          where: { id: order.equipment_id },
          data: {
            condition: 'no_operativo',
            kilometer: input.kilometer,
          },
        });
        // `condition` es condición registrada de los tipos de documento de equipos: refresca el cache de status.
        await refreshDocumentStatus(tx, 'Equipos', { ids: [order.equipment_id] });
      } else if (order.other_equipment_id) {
        await tx.other_equipment.update({
          where: { id: order.other_equipment_id },
          data: { condition: 'no_operativo' },
        });
      }

      return { equipmentId: order.equipment_id ?? order.other_equipment_id };
    });

    serverLogger.info('Entrada a taller aprobada, equipo actualizado', {
      data: {
        orderId: input.orderId,
        equipmentId: result.equipmentId,
        kilometer: input.kilometer,
      },
    });

    await invalidateCacheTags(INVALIDATION_MAP.approveWorkshopEntry);

    return { success: true };
  } catch (error) {
    serverLogger.error('Error al aprobar entrada a taller', { data: { error, orderId: input.orderId } });
    throw error;
  }
}
