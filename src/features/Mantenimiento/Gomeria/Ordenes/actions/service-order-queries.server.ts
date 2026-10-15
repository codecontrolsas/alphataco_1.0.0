'use server';

import { checkVehicleTireReadiness } from '@/features/Mantenimiento/Gomeria/shared/check-vehicle-tire-readiness';
import {
  assertVehicleInActiveCompany,
  getVehicleCompanyId,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { resolveVehicleTireTemplateId } from '@/features/Mantenimiento/Gomeria/shared/resolve-template';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { TIRE_READINESS_MESSAGES } from '@/features/Mantenimiento/Gomeria/shared/tire-readiness-messages';
import {
  requireGomeriaAccessForCompany,
  requireGomeriaPermission,
} from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/queries');

/**
 * Posiciones de un vehículo para el detalle de orden del dashboard: el vehículo tiene que
 * ser de la empresa activa.
 */
export async function getVehicleTirePositions(vehicleId: string) {
  logger.debug('Fetching vehicle tire positions', { data: { vehicleId } });

  try {
    parseInput(uuidSchema, vehicleId);
    await requireGomeriaPermission('ordenes_gomeria', 'view');
    await assertVehicleInActiveCompany(vehicleId);

    const positions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
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
    });
    return positions;
  } catch (error) {
    logger.error('Error fetching vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

// ============================================================================
// GET AVAILABLE TIRES
// ============================================================================

/**
 * Stock de cubiertas disponibles (y extraviadas) de la empresa del vehículo que se está
 * atendiendo.
 *
 * La empresa sale del vehículo y no de la sesión: el picker se usa tanto desde el
 * dashboard como desde el QR anónimo. Antes no filtraba por empresa y listaba el stock de
 * todas.
 *
 * Ya NO se filtra por la medida del eje: el operario elige la cubierta que
 * corresponde (su medida es visible en cada fila). Ordenadas por medida y luego por serie
 * para facilitar la búsqueda.
 *
 * Una cubierta con stock solo se monta si está en un depósito (Almacenes etapa 6): las
 * extraviadas con stock no se ofrecen hasta que se marcan como encontradas.
 */
export async function getAvailableTiresForVehicle(vehicleId: string) {
  logger.debug('Fetching available tires', { data: { vehicleId } });

  try {
    parseInput(uuidSchema, vehicleId);
    const companyId = await getVehicleCompanyId(prisma, vehicleId);
    await requireGomeriaAccessForCompany(companyId, 'ordenes_gomeria', 'view');

    const tires = await prisma.tires.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        OR: [
          { status: 'AVAILABLE', OR: [{ material_unit_id: null }, { material_unit: { status: 'IN_STOCK' } }] },
          { status: 'MISSING', material_unit_id: null },
        ],
      },
      select: {
        id: true,
        serial_number: true,
        status: true,
        is_new: true,
        retread_level: true,
        tread_depth: true,
        brand: { select: { id: true, name: true } },
        tire_type: { select: { id: true, size: true, tread_type: true } },
        material_unit: { select: { warehouse: { select: { name: true } } } },
      },
      orderBy: [{ tire_type: { size: 'asc' } }, { status: 'asc' }, { serial_number: 'asc' }],
    });
    return tires;
  } catch (error) {
    logger.error('Error fetching available tires', { data: { error } });
    throw error;
  }
}

/**
 * Depósitos activos de la empresa del vehículo atendido, para elegir adónde vuelve la
 * cubierta que se desmonta a "Disponible". La empresa sale del vehículo (flujo del QR).
 */
export async function getTireReturnWarehousesForVehicle(vehicleId: string) {
  parseInput(uuidSchema, vehicleId);
  const companyId = await getVehicleCompanyId(prisma, vehicleId);
  await requireGomeriaAccessForCompany(companyId, 'ordenes_gomeria', 'view');
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

// ============================================================================
// SEARCH VEHICLE BY DOMAIN
// ============================================================================

/**
 * Buscador de vehículos del asistente en modo dashboard (desde el QR el vehículo ya viene
 * fijado por la ruta y este paso no se muestra), así que la empresa sale de la sesión.
 */
export async function searchVehicleByDomain(domain: string) {
  logger.debug('Searching vehicle by domain', { data: { domain } });

  try {
    const companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');

    const vehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        domain: { contains: domain, mode: 'insensitive' },
      },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        type: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            name: true,
            tire_template_id: true,
          },
        },
      },
      take: 10,
    });

    return vehicles.map((v) => {
      return {
        id: v.id,
        domain: v.domain,
        intern_number: v.intern_number,
        tire_template_id: resolveVehicleTireTemplateId(v),
        sub_type_id: v.sub_type?.id ?? null,
        sub_type_name: v.sub_type?.name ?? null,
        type_id: v.type ?? null,
      };
    });
  } catch (error) {
    logger.error('Error searching vehicle by domain', { data: { error, domain } });
    throw error;
  }
}

/**
 * Get vehicle type info (is_tractor_unit, has_hitch) for hitch UI visibility.
 *
 * Perímetro por recurso: sólo devuelve el tipo del propio vehículo de la ruta y también se
 * usa desde el QR, así que no hay empresa de sesión contra la cual validar.
 */
export async function getVehicleTypeInfo(vehicleId: string) {
  logger.debug('Getting vehicle type info', { data: { vehicleId } });

  parseInput(uuidSchema, vehicleId);
  const vehicleCompanyId = await getVehicleCompanyId(prisma, vehicleId).catch(() => null);
  if (!vehicleCompanyId) return null;
  await requireGomeriaAccessForCompany(vehicleCompanyId, 'ordenes_gomeria', 'view');

  try {
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicleId },
      select: {
        type_vehicles_typeTotype: {
          select: {
            id: true,
            name: true,
            is_tractor_unit: true,
            has_hitch: true,
          },
        },
      },
    });

    if (!vehicle?.type_vehicles_typeTotype) return null;

    const vType = vehicle.type_vehicles_typeTotype;
    return {
      id: vType.id,
      name: vType.name,
      is_tractor_unit: vType.is_tractor_unit ?? false,
      has_hitch: vType.has_hitch ?? false,
    };
  } catch (error) {
    logger.error('Error getting vehicle type info', { data: { error, vehicleId } });
    return null;
  }
}

/**
 * Search compatible hitch vehicles for a given tractor unit.
 * Uses type_hitch_types junction table to filter by compatible types.
 */
export async function searchCompatibleHitchVehicles(tractorId: string, domain: string) {
  logger.debug('Searching compatible hitch vehicles', { data: { tractorId, domain } });

  parseInput(uuidSchema, tractorId);
  const tractorCompanyId = await getVehicleCompanyId(prisma, tractorId).catch(() => null);
  if (!tractorCompanyId) return [];
  await requireGomeriaAccessForCompany(tractorCompanyId, 'ordenes_gomeria', 'view');

  try {
    // 1. Get the tractor's type — la empresa sale del propio tractor, no del cliente:
    //    este buscador también corre desde el QR anónimo, sin empresa activa.
    const tractor = await prisma.vehicles.findUnique({
      where: { id: tractorId },
      select: {
        company_id: true,
        type_vehicles_typeTotype: {
          select: { id: true, is_tractor_unit: true, has_hitch: true },
        },
      },
    });

    if (!tractor?.company_id) return [];
    if (!tractor.type_vehicles_typeTotype?.is_tractor_unit || !tractor.type_vehicles_typeTotype.has_hitch) {
      return [];
    }

    const companyId = tractor.company_id;

    // 2. Get compatible type IDs from type_hitch_types
    const hitchTypes = await prisma.type_hitch_types.findMany({
      where: { type_id: tractor.type_vehicles_typeTotype.id },
      select: { compatible_type_id: true },
    });

    if (hitchTypes.length === 0) return [];

    const compatibleTypeIds = hitchTypes.map((ht) => ht.compatible_type_id);

    // 3. Search vehicles of compatible types, filtered by domain
    const vehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        type: { in: compatibleTypeIds },
        id: { not: tractorId },
        ...(domain.trim().length > 0 ? { domain: { contains: domain, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        type: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            name: true,
            tire_template_id: true,
          },
        },
      },
      take: 10,
      orderBy: { domain: 'asc' },
    });

    return vehicles.map((v) => {
      return {
        id: v.id,
        domain: v.domain,
        intern_number: v.intern_number,
        tire_template_id: resolveVehicleTireTemplateId(v),
        sub_type_id: v.sub_type?.id ?? null,
        sub_type_name: v.sub_type?.name ?? null,
        type_id: v.type ?? null,
      };
    });
  } catch (error) {
    logger.error('Error searching compatible hitch vehicles', { data: { error, tractorId, domain } });
    return [];
  }
}

// ============================================================================
// ENSURE VEHICLE TIRE POSITIONS (lazy generation)
// ============================================================================

/**
 * Ensures a vehicle has tire positions generated from its sub_type's template.
 * Idempotent: if positions already exist, returns them immediately.
 * If positions are missing, generates them from the sub_type's tire_template.
 *
 * Perímetro por recurso: opera sobre las posiciones del propio vehículo de la ruta y la
 * plantilla que ya tiene asignada, y corre también desde el QR, donde la sesión del
 * operario no sirve para validar la empresa.
 */
export async function ensureVehicleTirePositions(vehicleId: string) {
  logger.debug('Ensuring vehicle tire positions', { data: { vehicleId } });

  try {
    parseInput(uuidSchema, vehicleId);
    // Materialización idempotente de las posiciones desde la plantilla (la usa la vista de
    // detalle): alcanza con `view`; no cambia datos de negocio de la empresa.
    const vehicleCompanyId = await getVehicleCompanyId(prisma, vehicleId);
    await requireGomeriaAccessForCompany(vehicleCompanyId, 'ordenes_gomeria', 'view');

    const readiness = await checkVehicleTireReadiness(vehicleId);
    if (!readiness.ready) {
      const vehicleData = await prisma.vehicles.findUnique({
        where: { id: vehicleId },
        select: { domain: true },
      });
      const domain = vehicleData?.domain ?? vehicleId;
      throw new Error(TIRE_READINESS_MESSAGES.no_template(domain));
    }

    // Load vehicle-level axle size overrides once for enrichment of returned positions.
    const sizeOverrides = await prisma.vehicle_axle_tire_sizes.findMany({
      where: { vehicle_id: vehicleId },
      select: { axle_number: true, tire_size: true },
    });
    const overrideMap = new Map(sizeOverrides.map((o) => [o.axle_number, o.tire_size]));

    function enrich<T extends { axle_number: number; template_axle: { tire_size: string | null } | null }>(
      positions: T[]
    ): Array<T & { effective_tire_size: string | null }> {
      return positions.map((pos) => ({
        ...pos,
        effective_tire_size:
          overrideMap.get(pos.axle_number) ?? pos.template_axle?.tire_size ?? null,
      }));
    }

    // 1. Check if vehicle already has positions
    const existingPositions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
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
    });

    if (existingPositions.length > 0) {
      return enrich(existingPositions);
    }

    // 2. No positions — need to generate from vehicle's effective template
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            tire_template_id: true,
          },
        },
      },
    });

    const templateId = vehicle ? resolveVehicleTireTemplateId(vehicle) : null;
    if (!templateId) {
      throw new Error('Este equipo no tiene configuración de cubiertas asignada');
    }

    // 3. Load template axles
    const templateAxles = await prisma.tire_template_axles.findMany({
      where: { template_id: templateId },
      orderBy: { axle_number: 'asc' },
    });

    if (templateAxles.length === 0) {
      throw new Error('La plantilla del subtipo no tiene ejes configurados');
    }

    // 4. Calculate positions using TireDiagramRenderer logic
    const diagramAxles: DiagramAxle[] = templateAxles.map((axle) => ({
      id: axle.id,
      axle_number: axle.axle_number,
      tires_per_side: axle.tires_per_side,
      tire_size: axle.tire_size,
      is_drive_axle: axle.is_drive_axle,
      is_spare: axle.is_spare,
    }));

    const computedPositions = calculatePositions(diagramAxles);

    // 5. Create vehicle_tire_positions (all tire_id = null)
    if (computedPositions.length > 0) {
      const axleIdByNumber = new Map(templateAxles.map((a) => [a.axle_number, a.id]));

      await prisma.vehicle_tire_positions.createMany({
        data: computedPositions.map((pos) => ({
          vehicle_id: vehicleId,
          template_axle_id: axleIdByNumber.get(pos.axle_number)!,
          position_number: pos.position_number,
          axle_number: pos.axle_number,
          side: pos.side,
          tire_id: null,
        })),
      });
    }

    // 6. Re-fetch with full includes and return
    const newPositions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
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
    });

    logger.info('Generated tire positions for vehicle', {
      data: { vehicleId, count: newPositions.length, templateId },
    });

    return enrich(newPositions);
  } catch (error) {
    logger.error('Error ensuring vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type VehicleTirePosition = Awaited<ReturnType<typeof getVehicleTirePositions>>[number];

export type AvailableTire = Awaited<ReturnType<typeof getAvailableTiresForVehicle>>[number];

export type VehicleSearchResult = Awaited<ReturnType<typeof searchVehicleByDomain>>[number];

export type EnsuredTirePosition = Awaited<ReturnType<typeof ensureVehicleTirePositions>>[number];
