'use server';

import { checkVehicleTireReadiness } from '@/features/Mantenimiento/Gomeria/shared/check-vehicle-tire-readiness';
import {
  assertServiceOrderInActiveCompany,
  assertVehicleInCompany,
  getVehicleCompanyId,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { getResourceCompanyId } from '@/features/Mantenimiento/shared/resource-company';
import { TIRE_READINESS_MESSAGES } from '@/features/Mantenimiento/Gomeria/shared/tire-readiness-messages';
import type { TireOldDestination, TireServiceOrderStatus, TireStatus } from '@/generated/prisma/enums';
import { tireStatusLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { Logger } from '@/lib/logger';
import { ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import {
  requireGomeriaAccessForCompany,
  requireGomeriaPermission,
} from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { reverseStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';
import { GOMERIA_TX_OPTIONS, fetchVehicleTirePositions } from './service-order-internal.server';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/lifecycle');

// ============================================================================
// CREATE SERVICE ORDER
// ============================================================================

const createServiceOrderSchema = z.object({
  vehicle_id: uuidSchema,
  trailer_vehicle_id: uuidSchema.nullish(),
  kilometer: z.string().trim().max(30, 'El kilometraje es demasiado largo').nullish(),
});

/**
 * Abre una orden de gomería para un vehículo.
 *
 * La empresa la deriva el SERVIDOR del vehículo (`getResourceCompanyId`) y no llega más
 * como parámetro: este flujo también corre desde el QR anónimo, donde no hay empresa
 * activa, y un `company_id` de parámetro permitía abrir órdenes en cualquier empresa.
 */
export async function createServiceOrder(input: {
  vehicle_id: string;
  trailer_vehicle_id?: string | null;
  kilometer?: string | null;
}) {
  const profile = await requireServerAuthProfile();
  logger.debug('Creating service order', { data: { vehicle_id: input?.vehicle_id } });

  try {
    const data = parseInput(createServiceOrderSchema, input);
    const companyId = await getResourceCompanyId(prisma, 'vehicle', data.vehicle_id);
    // Dashboard (permiso `create`) o empleado de la empresa del equipo (QR).
    await requireGomeriaAccessForCompany(companyId, 'ordenes_gomeria', 'create');

    // Validar readiness del vehículo
    const vehicleData = await prisma.vehicles.findUnique({
      where: { id: data.vehicle_id },
      select: { domain: true },
    });
    const vehicleDomain = vehicleData?.domain ?? data.vehicle_id;

    const vehicleReadiness = await checkVehicleTireReadiness(data.vehicle_id);
    if (!vehicleReadiness.ready) {
      throw new Error(TIRE_READINESS_MESSAGES.no_template(vehicleDomain));
    }

    // Validar readiness del trailer si aplica
    if (data.trailer_vehicle_id) {
      // El enganche llega del cliente: tiene que ser de la misma empresa que el vehículo.
      await assertVehicleInCompany(prisma, data.trailer_vehicle_id, companyId);

      const trailerData = await prisma.vehicles.findUnique({
        where: { id: data.trailer_vehicle_id },
        select: { domain: true },
      });
      const trailerDomain = trailerData?.domain ?? data.trailer_vehicle_id;

      const trailerReadiness = await checkVehicleTireReadiness(data.trailer_vehicle_id);
      if (!trailerReadiness.ready) {
        throw new Error(TIRE_READINESS_MESSAGES.no_template(trailerDomain));
      }
    }

    // Snapshot current tire positions for historical diagram reconstruction
    const vehiclePositions = await fetchVehicleTirePositions(data.vehicle_id);
    let trailerPositions: Awaited<ReturnType<typeof fetchVehicleTirePositions>> = [];
    if (data.trailer_vehicle_id) {
      trailerPositions = await fetchVehicleTirePositions(data.trailer_vehicle_id);
    }

    const allPositions = [...vehiclePositions, ...trailerPositions];

    // Build axle snapshot (unique axle geometries)
    const axleMap = new Map<string, object>();
    for (const pos of allPositions) {
      if (!pos.template_axle) continue;
      if (!axleMap.has(pos.template_axle.id)) {
        axleMap.set(pos.template_axle.id, {
          id: pos.template_axle.id,
          axle_number: pos.template_axle.axle_number,
          tires_per_side: pos.template_axle.tires_per_side,
          tire_size: pos.template_axle.tire_size,
          is_drive_axle: pos.template_axle.is_drive_axle,
          is_spare: pos.template_axle.is_spare,
        });
      }
    }

    // Build positions snapshot (all positions with tire details)
    const positionsSnapshot = allPositions.map((pos) => ({
      position_number: pos.position_number,
      axle_number: pos.axle_number,
      side: pos.side,
      vehicle_id: pos.vehicle_id,
      tire_id: pos.tire_id,
      tire_serial: pos.tire?.serial_number ?? null,
      tire_brand: pos.tire?.brand?.name ?? null,
      tire_size: pos.tire?.tire_type?.size ?? null,
      tire_tread_type: pos.tire?.tire_type?.tread_type ?? null,
      tire_status: pos.tire?.status ?? null,
      tire_is_new: pos.tire?.is_new ?? null,
      tire_tread_depth: pos.tire?.tread_depth ? Number(pos.tire.tread_depth) : null,
    }));

    const order = await prisma.tire_service_orders.create({
      data: {
        vehicle_id: data.vehicle_id,
        trailer_vehicle_id: data.trailer_vehicle_id ?? null,
        kilometer: data.kilometer ?? null,
        service_date: new Date(),
        created_by: profile.id,
        company_id: companyId,
        axle_snapshot: Array.from(axleMap.values()),
        positions_snapshot: positionsSnapshot,
      },
    });
    return order;
  } catch (error) {
    logger.error('Error creating service order', { data: { error } });
    throw error;
  }
}

// ============================================================================
// CLOSE SERVICE ORDER
// ============================================================================

/** Cierre de la orden, una vez que el llamador validó el perímetro que le corresponde. */
async function markServiceOrderClosed(id: string) {
  // La transición se acota al estado de origen: cerrar dos veces (o una orden anulada) no pisa nada.
  const { count } = await prisma.tire_service_orders.updateMany({
    where: { id, status: 'OPEN' },
    data: {
      status: 'CLOSED' as TireServiceOrderStatus,
      closed_at: new Date(),
    },
  });
  if (count === 0) throw new Error('Solo se pueden finalizar órdenes en estado Abierta');
  return { id };
}

/**
 * Finaliza una orden desde el dashboard: la orden tiene que ser de la empresa activa.
 *
 * Antes era una sola función para el dashboard y el QR, y el único chequeo era que la
 * orden existiera: cualquier usuario autenticado que conociera el uuid cerraba la orden de
 * otra empresa. El QR no necesitaba ese permiso tan amplio, tiene su propia variante
 * (`closeServiceOrderForVehicle`), igual que `createTire`/`createTireForVehicle`.
 */
export async function closeServiceOrder(id: string) {
  logger.debug('Closing service order', { data: { id } });

  try {
    parseInput(uuidSchema, id);
    await requireGomeriaPermission('ordenes_gomeria', 'update');
    await assertServiceOrderInActiveCompany(id);
    return await markServiceOrderClosed(id);
  } catch (error) {
    logger.error('Error closing service order', { data: { error, id } });
    throw error;
  }
}

/**
 * Finaliza la orden del asistente de gomería (alcanzable desde el QR anónimo): la empresa
 * sale del vehículo que se está atendiendo y no de la sesión, porque el operario del QR no
 * es miembro de la empresa.
 *
 * El vehículo es el de la ruta escaneada, así que exigir que la orden sea de ese vehículo
 * acota el cierre a la orden que el asistente tiene abierta: un uuid de orden ajeno ya no
 * alcanza.
 */
export async function closeServiceOrderForVehicle(id: string, vehicleId: string) {
  logger.debug('Closing service order for vehicle', { data: { id, vehicleId } });

  try {
    parseInput(uuidSchema, id);
    parseInput(uuidSchema, vehicleId);
    const companyId = await getVehicleCompanyId(prisma, vehicleId);
    await requireGomeriaAccessForCompany(companyId, 'ordenes_gomeria', 'update');

    const order = await prisma.tire_service_orders.findFirst({
      where: { id, vehicle_id: vehicleId, company_id: companyId },
      select: { id: true },
    });
    if (!order) throw new Error('La orden de gomería no pertenece al equipo que se está atendiendo');

    return await markServiceOrderClosed(id);
  } catch (error) {
    logger.error('Error closing service order for vehicle', { data: { error, id, vehicleId } });
    throw error;
  }
}

// ============================================================================
// CANCEL SERVICE ORDER
// ============================================================================

/**
 * Anular una orden es una acción del dashboard: la orden tiene que ser de la empresa activa.
 * Antes de revertir los estados anula, en orden inverso, los movimientos de stock de cada item
 * (devoluciones y montajes, Almacenes etapa 6).
 */
export async function cancelServiceOrder(id: string): Promise<ActionResult> {
  logger.debug('Cancelling service order', { data: { id } });

  try {
    parseInput(uuidSchema, id);
    // Anular borra la orden: exige `delete` (no alcanza con `update`).
    await requireGomeriaPermission('ordenes_gomeria', 'delete');
    await assertServiceOrderInActiveCompany(id);
    const profile = await requireServerAuthProfile();

    await withActor(profile.credentialId, async (tx) => {
      // 1. Fetch the order and verify it's OPEN
      const order = await tx.tire_service_orders.findUnique({
        where: { id },
        select: { id: true, status: true, company_id: true },
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }
      if (order.status !== 'OPEN') {
        throw new Error('Solo se pueden cancelar órdenes en estado Abierta');
      }

      // 2. Fetch all service items
      const items = await tx.tire_service_items.findMany({
        where: { service_order_id: id },
        orderBy: { created_at: 'desc' },
      });

      // 3. Check if any item has old_tire_destination = DISCARD
      const hasDiscardedTires = items.some((item) => item.old_tire_destination === ('DISCARD' as TireOldDestination));
      if (hasDiscardedTires) {
        throw new Error('No se puede cancelar: la orden contiene cubiertas descartadas');
      }

      // 4. Stock: anular devoluciones y montajes, del item mas nuevo al mas viejo. Dentro de un
      //    item, primero la devolucion de la que salio y despues el montaje de la que entro.
      for (const item of items) {
        for (const movementId of [item.return_movement_id, item.mount_movement_id]) {
          if (!movementId) continue;
          await reverseStockMovement(tx, order.company_id, profile.id, movementId, 'Anulación de la orden de gomería');
        }
      }

      // 5. Reverse items in reverse chronological order (already sorted desc by created_at)
      for (const item of items) {
        if (item.action === 'CALIBRATE') {
          // No status to reverse for calibration
          continue;
        }

        // Las cubiertas tienen que seguir como las dejo la orden: si despues se marcaron como
        // reparadas o encontradas (y volvieron al deposito), revertir las dejaria montadas segun
        // Gomeria y en el deposito segun Almacenes.
        await assertTireStatusForCancel(tx, item.tire_id, expectedOldTireStatus(item));
        if (item.new_tire_id) await assertTireStatusForCancel(tx, item.new_tire_id, 'INSTALLED');

        if (item.action === 'REPLACE') {
          // Reverse new tire back to AVAILABLE
          if (item.new_tire_id) {
            await tx.tires.update({
              where: { id: item.new_tire_id },
              data: { status: 'AVAILABLE' },
            });
          }

          // Reverse old tire back to INSTALLED (if it was moved out)
          if (item.tire_id && (item.old_tire_destination === 'AVAILABLE' || item.old_tire_destination === 'REPAIR')) {
            await tx.tires.update({
              where: { id: item.tire_id },
              data: { status: 'INSTALLED' },
            });
            // Restore the position
            await tx.vehicle_tire_positions.updateMany({
              where: {
                vehicle_id: item.vehicle_id,
                position_number: item.position_number,
              },
              data: { tire_id: item.tire_id },
            });
          }
        }

        if (item.action === 'REPAIR') {
          // Reverse new tire back to AVAILABLE
          if (item.new_tire_id) {
            await tx.tires.update({
              where: { id: item.new_tire_id },
              data: { status: 'AVAILABLE' },
            });
          }
          // Reverse old tire back to INSTALLED and restore position
          if (item.tire_id) {
            await tx.tires.update({
              where: { id: item.tire_id },
              data: { status: 'INSTALLED' },
            });
            await tx.vehicle_tire_positions.updateMany({
              where: {
                vehicle_id: item.vehicle_id,
                position_number: item.position_number,
              },
              data: { tire_id: item.tire_id },
            });
          }
        }

        if (item.action === 'MISSING_REPORT' && item.tire_id) {
          // Reverse missing report: restore tire to INSTALLED and restore position
          await tx.tires.update({
            where: { id: item.tire_id },
            data: { status: 'INSTALLED' },
          });
          await tx.vehicle_tire_positions.updateMany({
            where: {
              vehicle_id: item.vehicle_id,
              position_number: item.position_number,
            },
            data: { tire_id: item.tire_id },
          });
        }

        // Initial assign: tire_id is null in item, new_tire was placed for the first time
        if (!item.tire_id && item.new_tire_id) {
          await tx.tires.update({
            where: { id: item.new_tire_id },
            data: { status: 'AVAILABLE' },
          });
          await tx.vehicle_tire_positions.updateMany({
            where: {
              vehicle_id: item.vehicle_id,
              position_number: item.position_number,
            },
            data: { tire_id: null },
          });
        }
      }

      // 6. Delete the order (cascades to items)
      const { count } = await tx.tire_service_orders.deleteMany({ where: { id, status: 'OPEN' } });
      if (count === 0) throw new Error('La orden cambió de estado mientras se anulaba. Actualizá la pantalla.');
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'cancelar la orden');
  }
}

/** Estado en que la orden dejo la cubierta que salio de la posicion (null si no hay que verificarla). */
function expectedOldTireStatus(item: {
  action: string;
  tire_id: string | null;
  old_tire_destination: TireOldDestination | null;
}): TireStatus | null {
  if (!item.tire_id) return null;
  if (item.action === 'REPAIR') return 'IN_REPAIR';
  if (item.action === 'MISSING_REPORT') return 'MISSING';
  if (item.action === 'REPLACE') {
    if (item.old_tire_destination === 'REPAIR') return 'IN_REPAIR';
    if (item.old_tire_destination === 'AVAILABLE') return 'AVAILABLE';
  }
  return null;
}

async function assertTireStatusForCancel(
  tx: Pick<typeof prisma, 'tires'>,
  tireId: string | null,
  expected: TireStatus | null
): Promise<void> {
  if (!tireId || !expected) return;
  const tire = await tx.tires.findUnique({ where: { id: tireId }, select: { serial_number: true, status: true } });
  if (tire && tire.status !== expected) {
    throw new Error(
      `No se puede anular la orden: la cubierta ${tire.serial_number} cambió de estado después (hoy está ${tireStatusLabels[tire.status]?.toLowerCase() ?? tire.status})`
    );
  }
}
