'use server';

import {
  assertTireInCompany,
  assertWarehouseInCompany,
  assertVehicleInCompany,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import type { TireOldDestination } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { requireGomeriaAccessForCompany } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import type { PrismaLike } from '@/features/Mantenimiento/shared/resource-company';
import { z } from 'zod';
import { mountTire, returnTire, writeOffTire } from '@/features/Warehouses/lib/tire-stock';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { GOMERIA_TX_OPTIONS, tireServiceReference } from './service-order-internal.server';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/operations');

const measureSchema = z.number().finite().nonnegative().max(1_000_000).optional();
const observationsSchema = z.string().trim().max(1000, 'Las observaciones son demasiado largas').optional();
const positionSchema = z.number().int().min(1).max(200);

const calibrationSchema = z.object({
  serviceOrderId: uuidSchema,
  positionNumber: positionSchema,
  vehicleId: uuidSchema,
  tireId: uuidSchema,
  treadDepth: measureSchema,
  pressureStart: measureSchema,
  pressureEnd: measureSchema,
  observations: observationsSchema,
});

const repairSchema = z.object({
  serviceOrderId: uuidSchema,
  positionNumber: positionSchema,
  vehicleId: uuidSchema,
  tireId: uuidSchema,
  newTireId: uuidSchema,
  observations: observationsSchema,
});

const replaceSchema = z.object({
  serviceOrderId: uuidSchema,
  positionNumber: positionSchema,
  vehicleId: uuidSchema,
  tireId: uuidSchema.nullable(),
  newTireId: uuidSchema,
  oldDestination: z.enum(['AVAILABLE', 'DISCARD', 'REPAIR']).optional(),
  oldTireWarehouseId: uuidSchema.nullish(),
  discardPhotoUrl: z.string().trim().max(2000).optional(),
  discardComment: z.string().trim().max(1000).optional(),
  treadDepth: measureSchema,
  pressureStart: measureSchema,
  pressureEnd: measureSchema,
  observations: observationsSchema,
});

const missingReportSchema = z.object({
  serviceOrderId: uuidSchema,
  positionNumber: positionSchema,
  vehicleId: uuidSchema,
  tireId: uuidSchema,
  observations: observationsSchema,
});

/**
 * Autoriza una operación sobre una orden y devuelve su empresa: la empresa sale de la orden
 * (el flujo corre también desde el QR), el actor necesita `update` en el dashboard o ser
 * empleado de esa empresa, y la orden tiene que seguir Abierta.
 */
async function authorizeOrderOperation(client: PrismaLike, orderId: string): Promise<string> {
  const order = await client.tire_service_orders.findUnique({
    where: { id: orderId },
    select: { company_id: true, status: true },
  });
  if (!order) throw new Error('No se encontró la orden de gomería');
  await requireGomeriaAccessForCompany(order.company_id, 'ordenes_gomeria', 'update');
  if (order.status !== 'OPEN') throw new Error('La orden ya no está abierta');
  return order.company_id;
}

// ============================================================================
// CALIBRATE
// ============================================================================

/**
 * Calibración de una posición. La empresa sale de la orden (el flujo corre desde el QR) y
 * el vehículo y la cubierta que llegan del cliente tienen que ser de esa misma empresa.
 */
export async function performCalibration(rawData: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  treadDepth?: number;
  pressureStart?: number;
  pressureEnd?: number;
  observations?: string;
}) {
  logger.debug('Performing calibration', {
    data: { serviceOrderId: rawData.serviceOrderId, positionNumber: rawData.positionNumber },
  });

  try {
    const data = parseInput(calibrationSchema, rawData);
    const companyId = await authorizeOrderOperation(prisma, data.serviceOrderId);
    await assertVehicleInCompany(prisma, data.vehicleId, companyId);
    await assertTireInCompany(prisma, data.tireId, companyId);

    // Assert: tire exists at this position and matches tireId
    const position = await prisma.vehicle_tire_positions.findFirst({
      where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
    });
    if (!position) {
      throw new Error(`Posición ${data.positionNumber} no encontrada para el vehículo`);
    }
    if (position.tire_id !== data.tireId) {
      throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
    }

    // Create service item
    await prisma.tire_service_items.create({
      data: {
        service_order_id: data.serviceOrderId,
        position_number: data.positionNumber,
        vehicle_id: data.vehicleId,
        action: 'CALIBRATE',
        tire_id: data.tireId,
        tread_depth: data.treadDepth != null ? String(data.treadDepth) : null,
        pressure_start: data.pressureStart != null ? String(data.pressureStart) : null,
        pressure_end: data.pressureEnd != null ? String(data.pressureEnd) : null,
        observations: data.observations ?? null,
      },
    });

    // Update tread_depth on the tire if provided
    if (data.treadDepth != null) {
      await prisma.tires.update({
        where: { id: data.tireId },
        data: { tread_depth: String(data.treadDepth) },
      });
    }

    return { success: true };
  } catch (error) {
    logger.error('Error performing calibration', { data: { error } });
    throw error;
  }
}

// ============================================================================
// REPAIR (atomic: old → IN_REPAIR, new → INSTALLED)
// ============================================================================

/**
 * Reparación: sale la cubierta actual y entra otra del stock. La empresa sale de la orden
 * (flujo del QR) y las dos cubiertas y el vehículo tienen que pertenecerle.
 */
export async function performRepair(rawData: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  newTireId: string;
  observations?: string;
}): Promise<ActionResult> {
  logger.debug('Performing repair', {
    data: { serviceOrderId: rawData.serviceOrderId, positionNumber: rawData.positionNumber },
  });

  try {
    const data = parseInput(repairSchema, rawData);
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
      const companyId = await authorizeOrderOperation(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      await assertTireInCompany(tx, data.tireId, companyId);
      await assertTireInCompany(tx, data.newTireId, companyId);

      // 1. Assert old tire matches the position
      const position = await tx.vehicle_tire_positions.findFirst({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
      });
      if (!position) {
        throw new Error(`Posición ${data.positionNumber} no encontrada`);
      }
      if (position.tire_id !== data.tireId) {
        throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
      }

      // 2. Assert new tire is AVAILABLE or MISSING
      const newTire = await tx.tires.findUnique({ where: { id: data.newTireId } });
      if (!newTire) throw new Error('Cubierta de reemplazo no encontrada');
      if (newTire.status !== 'AVAILABLE' && newTire.status !== 'MISSING') {
        throw new Error(
          `La cubierta de reemplazo (${newTire.serial_number}) no está disponible — estado actual: ${newTire.status}`
        );
      }

      // 3. Old tire → IN_REPAIR (sin movimiento: sigue imputada al vehiculo hasta que vuelve)
      await tx.tires.update({
        where: { id: data.tireId },
        data: { status: 'IN_REPAIR' },
      });

      // 3b. Stock: la que entra sale de su deposito al vehiculo (Almacenes etapa 6).
      const mount = await mountTire(tx, companyId, profile.id, {
        tireId: data.newTireId,
        vehicleId: data.vehicleId,
        reference: await tireServiceReference(tx, data.vehicleId, data.positionNumber),
      });

      // 4. New tire → INSTALLED
      await tx.tires.update({
        where: { id: data.newTireId },
        data: { status: 'INSTALLED' },
      });

      // 5. Update position → new tire
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: data.newTireId },
      });

      // 6. Create service item
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'REPAIR',
          tire_id: data.tireId,
          new_tire_id: data.newTireId,
          observations: data.observations ?? null,
          mount_movement_id: mount?.id ?? null,
        },
      });
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'registrar la reparación');
  }
}

// ============================================================================
// REPLACE (atomic: handle old tire destination, new tire → INSTALLED)
// ============================================================================

/**
 * Reemplazo (o primera asignación si `tireId` es null). La empresa sale de la orden y el
 * vehículo y las cubiertas que llegan del cliente tienen que ser de esa empresa.
 */
export async function performReplace(rawData: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string | null; // null for initial assign (empty position)
  newTireId: string;
  oldDestination?: 'AVAILABLE' | 'DISCARD' | 'REPAIR';
  /** Deposito al que vuelve la cubierta que sale a disponible (si tiene stock). */
  oldTireWarehouseId?: string | null;
  discardPhotoUrl?: string;
  discardComment?: string;
  treadDepth?: number;
  pressureStart?: number;
  pressureEnd?: number;
  observations?: string;
}): Promise<ActionResult> {
  logger.debug('Performing replace', {
    data: { serviceOrderId: rawData.serviceOrderId, positionNumber: rawData.positionNumber },
  });

  try {
    const data = parseInput(replaceSchema, rawData);
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
      let returnMovementId: string | null = null;
      const companyId = await authorizeOrderOperation(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      if (data.tireId !== null) await assertTireInCompany(tx, data.tireId, companyId);
      await assertTireInCompany(tx, data.newTireId, companyId);
      if (data.oldTireWarehouseId) await assertWarehouseInCompany(tx, data.oldTireWarehouseId, companyId);

      if (data.tireId !== null) {
        // 1. Assert old tire matches the position
        const position = await tx.vehicle_tire_positions.findFirst({
          where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        });
        if (!position) {
          throw new Error(`Posición ${data.positionNumber} no encontrada`);
        }
        if (position.tire_id !== data.tireId) {
          throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
        }

        // 2. Handle old tire destination (y su stock: vuelve al deposito o se da de baja)
        if (data.oldDestination === 'AVAILABLE') {
          const returned = await returnTire(tx, companyId, profile.id, {
            tireId: data.tireId,
            warehouseId: data.oldTireWarehouseId ?? null,
            notes: 'Desmontada en la orden de gomería',
          });
          returnMovementId = returned?.id ?? null;
          await tx.tires.update({
            where: { id: data.tireId },
            data: { status: 'AVAILABLE' },
          });
        } else if (data.oldDestination === 'DISCARD') {
          await writeOffTire(tx, companyId, profile.id, {
            tireId: data.tireId,
            reason: 'BROKEN',
            notes: data.discardComment ?? '',
          });
          await tx.tires.update({
            where: { id: data.tireId },
            data: {
              status: 'DISCARDED',
              discard_photo: data.discardPhotoUrl ?? null,
              discard_comment: data.discardComment ?? null,
              discarded_at: new Date(),
            },
          });
        } else if (data.oldDestination === 'REPAIR') {
          await tx.tires.update({
            where: { id: data.tireId },
            data: { status: 'IN_REPAIR' },
          });
        }
      }

      // 3. Assert new tire is AVAILABLE or MISSING
      const newTire = await tx.tires.findUnique({ where: { id: data.newTireId } });
      if (!newTire) throw new Error('Cubierta de reemplazo no encontrada');
      if (newTire.status !== 'AVAILABLE' && newTire.status !== 'MISSING') {
        throw new Error(
          `La cubierta de reemplazo (${newTire.serial_number}) no está disponible — estado actual: ${newTire.status}`
        );
      }

      // 3b. Stock: la que entra sale de su deposito al vehiculo (Almacenes etapa 6).
      const mount = await mountTire(tx, companyId, profile.id, {
        tireId: data.newTireId,
        vehicleId: data.vehicleId,
        reference: await tireServiceReference(tx, data.vehicleId, data.positionNumber),
      });

      // 4. New tire → INSTALLED
      await tx.tires.update({
        where: { id: data.newTireId },
        data: {
          status: 'INSTALLED',
          ...(data.treadDepth != null ? { tread_depth: String(data.treadDepth) } : {}),
        },
      });

      // 5. Update position → new tire
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: data.newTireId },
      });

      // 6. Create service item
      const oldDestPrisma = data.oldDestination as TireOldDestination | undefined;
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'REPLACE',
          tire_id: data.tireId,
          new_tire_id: data.newTireId,
          old_tire_destination: oldDestPrisma ?? null,
          tread_depth: data.treadDepth != null ? String(data.treadDepth) : null,
          pressure_start: data.pressureStart != null ? String(data.pressureStart) : null,
          pressure_end: data.pressureEnd != null ? String(data.pressureEnd) : null,
          observations: data.observations ?? null,
          mount_movement_id: mount?.id ?? null,
          return_movement_id: returnMovementId,
        },
      });
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'registrar el reemplazo');
  }
}

// ============================================================================
// MISSING REPORT (mark tire as missing, clear position)
// ============================================================================

/**
 * Reporte de extravío. La empresa sale de la orden (flujo del QR) y el vehículo y la
 * cubierta tienen que pertenecerle.
 */
export async function performMissingReport(rawData: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  observations?: string;
}) {
  logger.debug('Performing missing report', {
    data: { serviceOrderId: rawData.serviceOrderId, positionNumber: rawData.positionNumber, tireId: rawData.tireId },
  });

  try {
    const data = parseInput(missingReportSchema, rawData);
    await prisma.$transaction(async (tx) => {
      const companyId = await authorizeOrderOperation(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      await assertTireInCompany(tx, data.tireId, companyId);

      // 1. Assert tire matches the position
      const position = await tx.vehicle_tire_positions.findFirst({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
      });
      if (!position) {
        throw new Error(`Posición ${data.positionNumber} no encontrada`);
      }
      if (position.tire_id !== data.tireId) {
        throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
      }

      // 2. Mark tire as MISSING
      await tx.tires.update({
        where: { id: data.tireId },
        data: { status: 'MISSING' },
      });

      // 3. Clear the position (tire_id = null)
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: null },
      });

      // 4. Create service item record
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'MISSING_REPORT',
          tire_id: data.tireId,
          new_tire_id: null,
          observations: data.observations ?? null,
        },
      });
    });

    return { success: true };
  } catch (error) {
    logger.error('Error performing missing report', { data: { error } });
    throw error;
  }
}
