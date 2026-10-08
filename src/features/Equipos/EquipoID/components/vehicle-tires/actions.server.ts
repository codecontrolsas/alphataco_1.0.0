'use server';

import { resolveVehicleTireTemplateId } from '@/features/Mantenimiento/Gomeria/shared/resolve-template';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { assertVehicleInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { applyTireStatusChange } from '@/features/Warehouses/lib/tire-stock';
import type { TireStatus } from '@/generated/prisma/enums';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const logger = new Logger('features/Equipos/VehicleTires');

// ============================================================================
// TYPES
// ============================================================================

export type AxleInput = {
  axle_number: number;
  tires_per_side: number;
  tire_size: string | null;
  is_drive_axle: boolean;
  is_spare: boolean;
};

export type DisplacedTireAction = {
  tireId: string;
  destination: 'AVAILABLE' | 'REPAIR' | 'DISCARD';
  /** Deposito al que vuelve si pasa a disponible y tiene stock (Almacenes etapa 6). */
  warehouseId?: string | null;
};

/** Quien mueve el stock de las cubiertas que salen del diagrama. */
type StockActor = { companyId: string; createdBy: string };

const DESTINATION_STATUS: Record<DisplacedTireAction['destination'], TireStatus> = {
  AVAILABLE: 'AVAILABLE',
  REPAIR: 'IN_REPAIR',
  DISCARD: 'DISCARDED',
};

// ============================================================================
// POSITIONS & TEMPLATE INFO
// ============================================================================

export async function getVehicleTirePositionsWithDetails(vehicleId: string) {
  logger.debug('Getting vehicle tire positions with details', { data: { vehicleId } });

  try {
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

    return positions.map((pos) => ({
      ...pos,
      effective_tire_size:
        overrideMap.get(pos.axle_number) ?? pos.template_axle?.tire_size ?? null,
    }));
  } catch (error) {
    logger.error('Error getting vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

export type VehicleTirePositionWithDetails = Awaited<
  ReturnType<typeof getVehicleTirePositionsWithDetails>
>[number];

export async function getVehicleTemplateInfo(vehicleId: string) {
  logger.debug('Getting vehicle template info', { data: { vehicleId } });

  try {
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
// SHARED HELPERS (internal — not exported)
// ============================================================================

/**
 * Rebuilds vehicle_tire_positions for a given template after axles have been
 * (re)inserted. Preserves tire assignments where position_number matches and
 * applies the caller-supplied destination for any displaced tires.
 */
async function rebuildPositionsPreservingTires(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  vehicleId: string,
  templateId: string,
  displacedTireActions: DisplacedTireAction[],
  actor: StockActor
) {
  // 1. Capture current tire assignments by position number
  const oldPositions = await tx.vehicle_tire_positions.findMany({
    where: { vehicle_id: vehicleId },
    select: { position_number: true, tire_id: true },
  });

  const tireByPosition = new Map<number, string>();
  for (const pos of oldPositions) {
    if (pos.tire_id) {
      tireByPosition.set(pos.position_number, pos.tire_id);
    }
  }

  // 2. Delete all old positions
  await tx.vehicle_tire_positions.deleteMany({ where: { vehicle_id: vehicleId } });

  // 3. Fetch the newly inserted axles for this template
  const newAxles = await tx.tire_template_axles.findMany({
    where: { template_id: templateId },
    orderBy: { axle_number: 'asc' },
  });

  // 4. Compute new positions
  const diagramAxles: DiagramAxle[] = newAxles.map((a) => ({
    id: a.id,
    axle_number: a.axle_number,
    tires_per_side: a.tires_per_side,
    tire_size: a.tire_size,
    is_drive_axle: a.is_drive_axle,
    is_spare: a.is_spare,
  }));

  const computedPositions = calculatePositions(diagramAxles);
  const axleIdByNumber = new Map(newAxles.map((a) => [a.axle_number, a.id]));

  // 5. Determine which tires land in new positions and which are displaced
  const newPositionNumbers = new Set(computedPositions.map((p) => p.position_number));
  const displacedTireIds = new Set<string>();

  for (const [posNum, tireId] of tireByPosition) {
    if (!newPositionNumbers.has(posNum)) {
      displacedTireIds.add(tireId);
    }
  }

  // 6. Create new positions, preserving tire assignments where position matches
  if (computedPositions.length > 0) {
    await tx.vehicle_tire_positions.createMany({
      data: computedPositions.map((pos) => ({
        vehicle_id: vehicleId,
        template_axle_id: axleIdByNumber.get(pos.axle_number)!,
        position_number: pos.position_number,
        axle_number: pos.axle_number,
        side: pos.side,
        tire_id: tireByPosition.get(pos.position_number) ?? null,
      })),
    });
  }

  // 6.5 Cleanup: borrar overrides de medida cuyo axle_number ya no existe
  const newAxleNumbers = new Set(newAxles.map((a) => a.axle_number));
  await tx.vehicle_axle_tire_sizes.deleteMany({
    where: {
      vehicle_id: vehicleId,
      axle_number: { notIn: [...newAxleNumbers] },
    },
  });

  // 7. Apply destination for displaced tires
  if (displacedTireIds.size > 0) {
    const actionMap = new Map(displacedTireActions.map((a) => [a.tireId, a]));

    for (const tireId of displacedTireIds) {
      const action = actionMap.get(tireId);
      const destination = action?.destination ?? 'AVAILABLE';
      const current = await tx.tires.findUniqueOrThrow({ where: { id: tireId }, select: { status: true } });
      await applyTireStatusChange(tx, actor.companyId, actor.createdBy, {
        tireId,
        from: current.status,
        to: DESTINATION_STATUS[destination],
        warehouseId: action?.warehouseId ?? null,
        notes: 'Quitada al editar el diagrama del equipo',
      });

      if (destination === 'AVAILABLE') {
        await tx.tires.update({ where: { id: tireId }, data: { status: 'AVAILABLE' } });
      } else if (destination === 'REPAIR') {
        await tx.tires.update({ where: { id: tireId }, data: { status: 'IN_REPAIR' } });
      } else if (destination === 'DISCARD') {
        await tx.tires.update({
          where: { id: tireId },
          data: { status: 'DISCARDED', discarded_at: new Date() },
        });
      }
    }
  }
}

// ============================================================================
// CUSTOM TEMPLATE CRUD
// ============================================================================

export async function createVehicleCustomTemplate(
  vehicleId: string,
  axles: AxleInput[],
  displacedTireActions: DisplacedTireAction[] = []
): Promise<ActionResult> {
  logger.debug('Creating custom tire template for vehicle', { data: { vehicleId, axleCount: axles.length } });

  try {
    // Mueve stock de las cubiertas: el equipo tiene que ser de la empresa activa.
    await assertVehicleInActiveCompany(vehicleId);
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
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

      if (axles.length > 0) {
        await tx.tire_template_axles.createMany({
          data: axles.map((axle) => ({
            template_id: template.id,
            axle_number: axle.axle_number,
            tires_per_side: axle.tires_per_side,
            tire_size: axle.tire_size,
            is_drive_axle: axle.is_drive_axle,
            is_spare: axle.is_spare,
          })),
        });
      }

      await tx.vehicles.update({
        where: { id: vehicleId },
        data: { tire_template_id: template.id },
      });

      await rebuildPositionsPreservingTires(tx, vehicleId, template.id, displacedTireActions, {
        companyId: vehicle.company_id!,
        createdBy: profile.id,
      });

      logger.info('Created custom template for vehicle', {
        data: { vehicleId, templateId: template.id },
      });
    }, prisma, GOMERIA_TX_OPTIONS);
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
  logger.debug('Updating custom axles for vehicle', { data: { vehicleId, axleCount: axles.length } });

  try {
    // Mueve stock de las cubiertas: el equipo tiene que ser de la empresa activa.
    await assertVehicleInActiveCompany(vehicleId);
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
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

      if (axles.length > 0) {
        await tx.tire_template_axles.createMany({
          data: axles.map((axle) => ({
            template_id: templateId,
            axle_number: axle.axle_number,
            tires_per_side: axle.tires_per_side,
            tire_size: axle.tire_size,
            is_drive_axle: axle.is_drive_axle,
            is_spare: axle.is_spare,
          })),
        });
      }

      await rebuildPositionsPreservingTires(tx, vehicleId, templateId, displacedTireActions, {
        companyId: vehicle.company_id!,
        createdBy: profile.id,
      });

      logger.info('Updated custom axles for vehicle', { data: { vehicleId, templateId } });
    }, prisma, GOMERIA_TX_OPTIONS);
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'guardar los ejes del equipo');
  }
}

/**
 * Vuelve a la plantilla del subtipo: las cubiertas montadas pasan a disponibles y, si tienen
 * stock, vuelven al depósito elegido (o al único activo de la empresa).
 */
export async function resetVehicleToSubTypeTemplate(
  vehicleId: string,
  warehouseId: string | null = null
): Promise<ActionResult> {
  logger.debug('Resetting vehicle to sub-type template', { data: { vehicleId } });

  try {
    // Mueve stock de las cubiertas: el equipo tiene que ser de la empresa activa.
    await assertVehicleInActiveCompany(vehicleId);
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
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

      const customTemplateId = vehicle.tire_template_id;

      const positions = await tx.vehicle_tire_positions.findMany({
        where: { vehicle_id: vehicleId, tire_id: { not: null } },
        select: { tire_id: true },
      });

      if (positions.length > 0) {
        const tireIds = positions.map((p) => p.tire_id!);
        for (const tireId of tireIds) {
          await applyTireStatusChange(tx, vehicle.company_id!, profile.id, {
            tireId,
            from: 'INSTALLED',
            to: 'AVAILABLE',
            warehouseId,
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
    }, prisma, GOMERIA_TX_OPTIONS);
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'restablecer la plantilla');
  }
}

// ============================================================================
// ORDERS DATATABLE
// ============================================================================

function buildOrdersWhereClause(
  vehicleId: string,
  state: ReturnType<typeof parseSearchParams>,
  excludeColumn?: string
) {
  const baseWhere = {
    OR: [{ vehicle_id: vehicleId }, { trailer_vehicle_id: vehicleId }],
  };

  const columnMap = { status: 'status', creator: 'created_by' };
  const excludeOpts = excludeColumn ? { exclude: [excludeColumn] } : undefined;

  const searchWhere = buildSearchWhere(state.search, ['kilometer']);
  const filtersWhere = buildFiltersWhere(state.filters, columnMap, excludeOpts);
  const dateRangeWhere = buildDateRangeFiltersWhere(state.filters, ['service_date', 'closed_at']);
  const textWhere = buildTextFiltersWhere(state.filters, ['kilometer']);

  return {
    AND: [baseWhere, searchWhere, filtersWhere, dateRangeWhere, textWhere].filter((w) => Object.keys(w).length > 0),
  };
}

export async function getVehicleTireOrdersPaginated(vehicleId: string, searchParams: DataTableSearchParams) {
  logger.debug('Getting paginated tire orders for vehicle', { data: { vehicleId } });

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildOrdersWhereClause(vehicleId, state);

    const VALID_SORT_FIELDS = ['service_date', 'status', 'kilometer', 'closed_at', 'created_at'];
    const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
      creator: (dir) => ({ creator: { lastname: dir } }),
    };

    let orderBy: Record<string, unknown>[] = [];
    if (state.sorting && state.sorting.length > 0) {
      for (const sort of state.sorting) {
        const fkMapper = FK_SORT_MAP[sort.id];
        if (fkMapper) {
          orderBy.push(fkMapper(sort.desc ? 'desc' : 'asc'));
        } else if (VALID_SORT_FIELDS.includes(sort.id)) {
          orderBy.push({ [sort.id]: sort.desc ? 'desc' : 'asc' });
        }
      }
    }
    if (orderBy.length === 0) {
      orderBy = [{ service_date: 'desc' }];
    }

    const [data, total] = await Promise.all([
      prisma.tire_service_orders.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          service_date: true,
          kilometer: true,
          status: true,
          closed_at: true,
          created_at: true,
          created_by: true,
          vehicle_id: true,
          trailer_vehicle_id: true,
          creator: { select: { id: true, fullname: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.tire_service_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error getting tire orders for vehicle', { data: { error, vehicleId } });
    throw error;
  }
}

export type VehicleTireOrderItem = Awaited<ReturnType<typeof getVehicleTireOrdersPaginated>>['data'][number];

export async function getVehicleTireOrdersForExport(vehicleId: string, searchParams: DataTableSearchParams) {
  logger.debug('Getting tire orders for export', { data: { vehicleId } });

  try {
    const state = parseSearchParams(searchParams);
    const where = buildOrdersWhereClause(vehicleId, state);

    const data = await prisma.tire_service_orders.findMany({
      where,
      orderBy: { service_date: 'desc' },
      select: {
        id: true,
        service_date: true,
        kilometer: true,
        status: true,
        closed_at: true,
        created_at: true,
        created_by: true,
        creator: { select: { fullname: true } },
        _count: { select: { items: true } },
      },
    });

    return data;
  } catch (error) {
    logger.error('Error exporting tire orders', { data: { error, vehicleId } });
    throw error;
  }
}

export async function getVehicleTireOrderSingleFacet(
  vehicleId: string,
  columnId: string,
  searchParams: DataTableSearchParams
) {
  logger.debug('Getting single facet for vehicle tire orders', { data: { vehicleId, columnId } });

  try {
    const state = parseSearchParams(searchParams);
    // Cross-filter: apply all filters EXCEPT the column being faceted
    const where = buildOrdersWhereClause(vehicleId, state, columnId);

    if (columnId === 'status') {
      const groups = await prisma.tire_service_orders.groupBy({
        by: ['status'],
        where,
        _count: true,
      });

      const counts = new Map(groups.map((g) => [g.status, g._count]));
      return { counts };
    }

    if (columnId === 'creator') {
      const groups = await prisma.tire_service_orders.groupBy({
        by: ['created_by'],
        where,
        _count: true,
      });

      const creatorIds = groups.map((g) => g.created_by);
      const creators = await prisma.profile.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, fullname: true },
      });

      const counts = new Map(groups.map((g) => [g.created_by, g._count]));
      const resolvedOptions = creators.map((c) => ({
        value: c.id,
        label: c.fullname ?? c.id,
      }));

      return { counts, resolvedOptions };
    }

    return { counts: new Map<string, number>() };
  } catch (error) {
    logger.error('Error getting tire order facet', { data: { error, vehicleId, columnId } });
    throw error;
  }
}

// ============================================================================
// VEHICLE AXLE SIZE OVERRIDES
// ============================================================================

export async function getVehicleAxleSizeOverrides(vehicleId: string) {
  logger.debug('Getting vehicle axle size overrides', { data: { vehicleId } });

  try {
    const overrides = await prisma.vehicle_axle_tire_sizes.findMany({
      where: { vehicle_id: vehicleId },
      select: { axle_number: true, tire_size: true },
      orderBy: { axle_number: 'asc' },
    });
    return overrides;
  } catch (error) {
    logger.error('Error getting vehicle axle size overrides', { data: { error, vehicleId } });
    throw error;
  }
}

/**
 * Upsert/delete bulk de overrides de medida por vehículo.
 * - tire_size string no vacío → upsert
 * - tire_size null o '' → delete
 */
export async function bulkUpdateVehicleAxleSizes(
  vehicleId: string,
  updates: Array<{ axle_number: number; tire_size: string | null }>
) {
  logger.debug('Bulk updating vehicle axle sizes', {
    data: { vehicleId, count: updates.length },
  });

  try {
    await prisma.$transaction(async (tx) => {
      for (const { axle_number, tire_size } of updates) {
        const cleaned = tire_size?.trim() ?? '';
        if (cleaned === '') {
          await tx.vehicle_axle_tire_sizes.deleteMany({
            where: { vehicle_id: vehicleId, axle_number },
          });
        } else {
          await tx.vehicle_axle_tire_sizes.upsert({
            where: {
              vehicle_id_axle_number: { vehicle_id: vehicleId, axle_number },
            },
            update: { tire_size: cleaned },
            create: { vehicle_id: vehicleId, axle_number, tire_size: cleaned },
          });
        }
      }
    });
    logger.info('Bulk updated vehicle axle sizes', { data: { vehicleId } });
  } catch (error) {
    logger.error('Error bulk updating vehicle axle sizes', { data: { error, vehicleId } });
    throw error;
  }
}
