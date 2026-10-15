'use server';

import { ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { withLastPressure } from '@/features/Mantenimiento/Gomeria/shared/last-tire-pressure.server';
import { resolveVehicleTireTemplateId } from '@/features/Mantenimiento/Gomeria/shared/resolve-template';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { parseInput, requireTiresUpdateAccess, requireTiresViewAccess } from '../lib/guards.server';
import { axleSizeUpdatesSchema, type AxleSizeUpdates } from '../schemas/axles';

const logger = new Logger('features/Equipos/VehicleTires/Positions');

// ============================================================================
// POSITIONS & TEMPLATE INFO
// ============================================================================

async function fetchVehicleTirePositions(vehicleId: string) {
  const [positions, overrides] = await Promise.all([
    prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            status: true,
            tread_depth: true,
            is_new: true,
            retread_level: true,
            material_unit_id: true,
            brand: { select: { id: true, name: true } },
            tire_type: { select: { id: true, size: true, tread_type: true } },
          },
        },
        template_axle: {
          select: {
            id: true,
            axle_number: true,
            tires_per_side: true,
            tire_size: true,
            is_drive_axle: true,
            is_spare: true,
          },
        },
      },
      orderBy: { position_number: 'asc' },
    }),
    prisma.vehicle_axle_tire_sizes.findMany({
      where: { vehicle_id: vehicleId },
      select: { axle_number: true, tire_size: true },
    }),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.axle_number, o.tire_size]));

  // Última presión medida de cada cubierta montada: una sola consulta agregada (sin N+1).
  return withLastPressure(
    positions.map((pos) => ({
      ...pos,
      effective_tire_size: overrideMap.get(pos.axle_number) ?? pos.template_axle?.tire_size ?? null,
    }))
  );
}

export async function getVehicleTirePositionsWithDetails(vehicleId: string) {
  logger.debug('Getting vehicle tire positions with details', { data: { vehicleId } });

  try {
    // El acceso se verifica en paralelo con la lectura: si falla, se lanza antes de devolver nada.
    const [, positions] = await Promise.all([requireTiresViewAccess(vehicleId), fetchVehicleTirePositions(vehicleId)]);
    return positions;
  } catch (error) {
    logger.error('Error getting vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

export type VehicleTirePositionWithDetails = Awaited<ReturnType<typeof getVehicleTirePositionsWithDetails>>[number];

export async function getVehicleTemplateInfo(vehicleId: string) {
  logger.debug('Getting vehicle template info', { data: { vehicleId } });

  try {
    await requireTiresViewAccess(vehicleId);

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicleId },
      select: {
        tire_template_id: true,
        tire_template: { select: { id: true, name: true, is_vehicle_override: true, source_template_id: true } },
        sub_type: {
          select: {
            id: true,
            name: true,
            tire_template_id: true,
            tire_template: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!vehicle) throw new Error('Vehículo no encontrado');

    const hasOverride = !!vehicle.tire_template_id;
    const effectiveTemplateId = resolveVehicleTireTemplateId(vehicle);

    if (!effectiveTemplateId) {
      return {
        hasOverride: false,
        templateId: null,
        templateName: null,
        sourceType: 'none' as const,
        subTypeName: vehicle.sub_type?.name ?? null,
        subTypeHasTemplate: !!vehicle.sub_type?.tire_template_id,
        templateAxles: [] as Array<{
          axle_number: number;
          tire_size: string | null;
          is_drive_axle: boolean;
          is_spare: boolean;
        }>,
      };
    }

    const templateAxles = await prisma.tire_template_axles.findMany({
      where: { template_id: effectiveTemplateId },
      orderBy: { axle_number: 'asc' },
      select: { axle_number: true, tire_size: true, is_drive_axle: true, is_spare: true },
    });

    return {
      hasOverride,
      templateId: effectiveTemplateId,
      templateName: hasOverride
        ? vehicle.tire_template?.name ?? 'Personalizada'
        : vehicle.sub_type?.tire_template?.name ?? null,
      sourceType: hasOverride ? ('vehicle' as const) : ('sub_type' as const),
      subTypeName: vehicle.sub_type?.name ?? null,
      subTypeHasTemplate: !!vehicle.sub_type?.tire_template_id,
      templateAxles,
    };
  } catch (error) {
    logger.error('Error getting vehicle template info', { data: { error, vehicleId } });
    throw error;
  }
}

export type VehicleTemplateInfo = Awaited<ReturnType<typeof getVehicleTemplateInfo>>;

// ============================================================================
// VEHICLE AXLE SIZE OVERRIDES
// ============================================================================

export async function getVehicleAxleSizeOverrides(vehicleId: string) {
  logger.debug('Getting vehicle axle size overrides', { data: { vehicleId } });

  try {
    await requireTiresViewAccess(vehicleId);

    return await prisma.vehicle_axle_tire_sizes.findMany({
      where: { vehicle_id: vehicleId },
      select: { axle_number: true, tire_size: true },
      orderBy: { axle_number: 'asc' },
    });
  } catch (error) {
    logger.error('Error getting vehicle axle size overrides', { data: { error, vehicleId } });
    throw error;
  }
}

/**
 * Upsert/delete bulk de overrides de medida por vehículo.
 * - tire_size string no vacío → upsert
 * - tire_size null o '' → delete
 *
 * Devuelve `ActionResult` (no lanza) para que el mensaje llegue al toast en producción. Solo acepta
 * ejes que existan en la plantilla efectiva del equipo.
 */
export async function bulkUpdateVehicleAxleSizes(vehicleId: string, updates: AxleSizeUpdates): Promise<ActionResult> {
  logger.debug('Bulk updating vehicle axle sizes', { data: { vehicleId, count: updates?.length } });

  try {
    await requireTiresUpdateAccess(vehicleId);
    const validUpdates = parseInput(axleSizeUpdatesSchema, updates);
    const profile = await requireServerAuthProfile();

    await withActor(profile.credentialId, async (tx) => {
      const vehicle = await tx.vehicles.findUnique({
        where: { id: vehicleId },
        select: {
          tire_template_id: true,
          sub_type: { select: { tire_template_id: true } },
        },
      });
      if (!vehicle) throw new Error('Vehículo no encontrado');

      const templateId = resolveVehicleTireTemplateId(vehicle);
      if (!templateId) throw new Error('El equipo no tiene configuración de cubiertas');

      const templateAxles = await tx.tire_template_axles.findMany({
        where: { template_id: templateId },
        select: { axle_number: true },
      });
      const validAxleNumbers = new Set(templateAxles.map((a) => a.axle_number));
      const unknown = validUpdates.find((u) => !validAxleNumbers.has(u.axle_number));
      if (unknown) throw new Error(`El eje ${unknown.axle_number} no existe en la configuración del equipo`);

      const toDelete: number[] = [];
      for (const { axle_number, tire_size } of validUpdates) {
        if (!tire_size) {
          toDelete.push(axle_number);
          continue;
        }
        await tx.vehicle_axle_tire_sizes.upsert({
          where: { vehicle_id_axle_number: { vehicle_id: vehicleId, axle_number } },
          update: { tire_size },
          create: { vehicle_id: vehicleId, axle_number, tire_size },
        });
      }
      if (toDelete.length > 0) {
        await tx.vehicle_axle_tire_sizes.deleteMany({
          where: { vehicle_id: vehicleId, axle_number: { in: toDelete } },
        });
      }
    });

    logger.info('Bulk updated vehicle axle sizes', { data: { vehicleId } });
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'actualizar las medidas de cubierta');
  }
}
