'use server';

import { ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { applyTireStatusChange } from '@/features/Warehouses/lib/tire-stock';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { z } from 'zod';
import { parseInput, requireTiresUpdateAccess } from '../lib/guards.server';
import { assertWarehousesInCompany, rebuildPositionsPreservingTires } from '../lib/rebuild-positions.server';
import { axlesSchema, displacedTireActionsSchema, type AxleInput, type DisplacedTireAction } from '../schemas/axles';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const logger = new Logger('features/Equipos/VehicleTires/Template');

// ============================================================================
// CUSTOM TEMPLATE CRUD
// ============================================================================

export async function createVehicleCustomTemplate(
  vehicleId: string,
  axles: AxleInput[],
  displacedTireActions: DisplacedTireAction[] = []
): Promise<ActionResult> {
  logger.debug('Creating custom tire template for vehicle', { data: { vehicleId, axleCount: axles?.length } });

  try {
    // Mueve stock de las cubiertas: permiso de edición + equipo de la empresa activa.
    await requireTiresUpdateAccess(vehicleId);
    const validAxles = parseInput(axlesSchema, axles);
    const validActions = parseInput(displacedTireActionsSchema, displacedTireActions);
    const profile = await requireServerAuthProfile();
    await withActor(
      profile.credentialId,
      async (tx) => {
        const vehicle = await tx.vehicles.findUnique({
          where: { id: vehicleId },
          select: {
            id: true,
            domain: true,
            company_id: true,
            tire_template_id: true,
            sub_type: { select: { tire_template_id: true } },
          },
        });

        if (!vehicle) throw new Error('Vehículo no encontrado');
        if (vehicle.tire_template_id) throw new Error('El vehículo ya tiene una plantilla personalizada');

        const sourceTemplateId = vehicle.sub_type?.tire_template_id ?? null;

        const template = await tx.tire_templates.create({
          data: {
            name: `Custom - ${vehicle.domain ?? vehicleId}`,
            company_id: vehicle.company_id!,
            is_vehicle_override: true,
            source_template_id: sourceTemplateId,
          },
        });

        await tx.tire_template_axles.createMany({
          data: validAxles.map((axle) => ({
            template_id: template.id,
            axle_number: axle.axle_number,
            tires_per_side: axle.tires_per_side,
            tire_size: axle.tire_size,
            is_drive_axle: axle.is_drive_axle,
            is_spare: axle.is_spare,
          })),
        });

        await tx.vehicles.update({
          where: { id: vehicleId },
          data: { tire_template_id: template.id },
        });

        await rebuildPositionsPreservingTires(tx, vehicleId, template.id, validActions, {
          companyId: vehicle.company_id!,
          createdBy: profile.id,
        });

        logger.info('Created custom template for vehicle', {
          data: { vehicleId, templateId: template.id },
        });
      },
      prisma,
      GOMERIA_TX_OPTIONS
    );
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'guardar la plantilla del equipo');
  }
}

export async function updateVehicleCustomAxles(
  vehicleId: string,
  axles: AxleInput[],
  displacedTireActions: DisplacedTireAction[] = []
): Promise<ActionResult> {
  logger.debug('Updating custom axles for vehicle', { data: { vehicleId, axleCount: axles?.length } });

  try {
    // Mueve stock de las cubiertas: permiso de edición + equipo de la empresa activa.
    await requireTiresUpdateAccess(vehicleId);
    const validAxles = parseInput(axlesSchema, axles);
    const validActions = parseInput(displacedTireActionsSchema, displacedTireActions);
    const profile = await requireServerAuthProfile();
    await withActor(
      profile.credentialId,
      async (tx) => {
        const vehicle = await tx.vehicles.findUnique({
          where: { id: vehicleId },
          select: {
            company_id: true,
            tire_template_id: true,
            tire_template: { select: { is_vehicle_override: true } },
          },
        });

        if (!vehicle?.tire_template_id || !vehicle.tire_template?.is_vehicle_override) {
          throw new Error('El vehículo no tiene una plantilla personalizada para editar');
        }

        const templateId = vehicle.tire_template_id;

        await tx.tire_template_axles.deleteMany({ where: { template_id: templateId } });

        await tx.tire_template_axles.createMany({
          data: validAxles.map((axle) => ({
            template_id: templateId,
            axle_number: axle.axle_number,
            tires_per_side: axle.tires_per_side,
            tire_size: axle.tire_size,
            is_drive_axle: axle.is_drive_axle,
            is_spare: axle.is_spare,
          })),
        });

        await rebuildPositionsPreservingTires(tx, vehicleId, templateId, validActions, {
          companyId: vehicle.company_id!,
          createdBy: profile.id,
        });

        logger.info('Updated custom axles for vehicle', { data: { vehicleId, templateId } });
      },
      prisma,
      GOMERIA_TX_OPTIONS
    );
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'guardar los ejes del equipo');
  }
}

/**
 * Vuelve a la plantilla del subtipo: las cubiertas montadas pasan a disponibles y, si tienen
 * stock, vuelven al depósito elegido (o al único activo de la empresa).
 *
 * Los overrides de medida por eje (`vehicle_axle_tire_sizes`) NO se limpian acá: se conservan a
 * propósito para los ejes con el mismo número en la plantilla del subtipo. Los que quedan sin eje se
 * borran la próxima vez que se reconstruyen las posiciones (`rebuildPositionsPreservingTires`).
 */
export async function resetVehicleToSubTypeTemplate(
  vehicleId: string,
  warehouseId: string | null = null
): Promise<ActionResult> {
  logger.debug('Resetting vehicle to sub-type template', { data: { vehicleId } });

  try {
    // Mueve stock de las cubiertas: permiso de edición + equipo de la empresa activa.
    await requireTiresUpdateAccess(vehicleId);
    const validWarehouseId = parseInput(z.string().uuid('Depósito inválido').nullable(), warehouseId ?? null);
    const profile = await requireServerAuthProfile();
    await withActor(
      profile.credentialId,
      async (tx) => {
        const vehicle = await tx.vehicles.findUnique({
          where: { id: vehicleId },
          select: {
            company_id: true,
            tire_template_id: true,
            tire_template: { select: { is_vehicle_override: true } },
            sub_type: { select: { tire_template_id: true } },
          },
        });

        if (!vehicle?.tire_template_id || !vehicle.tire_template?.is_vehicle_override) {
          throw new Error('El vehículo no tiene una plantilla personalizada para restablecer');
        }

        const companyId = vehicle.company_id!;
        const customTemplateId = vehicle.tire_template_id;
        await assertWarehousesInCompany(tx, companyId, [validWarehouseId]);

        const positions = await tx.vehicle_tire_positions.findMany({
          where: { vehicle_id: vehicleId, tire_id: { not: null } },
          select: { tire_id: true },
        });

        if (positions.length > 0) {
          // Una lectura para todas las cubiertas, acotada a la empresa del equipo.
          const tires = await tx.tires.findMany({
            where: { id: { in: positions.map((p) => p.tire_id!) }, company_id: companyId },
            select: { id: true },
          });
          const tireIds = tires.map((t) => t.id);

          // El motor de stock mueve cada unidad por separado; el cambio de estado va en un solo update.
          for (const tireId of tireIds) {
            await applyTireStatusChange(tx, companyId, profile.id, {
              tireId,
              from: 'INSTALLED',
              to: 'AVAILABLE',
              warehouseId: validWarehouseId,
              notes: 'Quitada al restablecer la plantilla del equipo',
            });
          }
          await tx.tires.updateMany({
            where: { id: { in: tireIds } },
            data: { status: 'AVAILABLE' },
          });
        }

        await tx.vehicle_tire_positions.deleteMany({ where: { vehicle_id: vehicleId } });

        await tx.vehicles.update({
          where: { id: vehicleId },
          data: { tire_template_id: null },
        });

        const otherVehicles = await tx.vehicles.count({
          where: { tire_template_id: customTemplateId, id: { not: vehicleId } },
        });

        if (otherVehicles === 0) {
          await tx.tire_templates.update({
            where: { id: customTemplateId },
            data: { is_active: false },
          });
        }

        logger.info('Reset vehicle to sub-type template', { data: { vehicleId } });
      },
      prisma,
      GOMERIA_TX_OPTIONS
    );
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'restablecer la plantilla');
  }
}
