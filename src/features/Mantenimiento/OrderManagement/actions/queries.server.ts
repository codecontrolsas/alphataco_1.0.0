'use server';

import { groupItemsBySector, isEligibleForWorkOrder } from '@/features/Mantenimiento/lib/work-order-generation';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getSupervisorFilterInfo } from '../../utils/supervisorFilter';
import { requireOrderManagementReadAccess } from './access';
import { serializeOtherEquipment } from './serialize';


const logger = new Logger('OrderManagement/queries');

/**
 * Obtiene los pedidos de mantenimiento en taller (in_workshop)
 * para la vista de Gestion de Ordenes del Jefe de Taller.
 * Incluye items con tipos de reparacion y datos del equipo.
 */
export async function getMaintenanceOrdersForManagement() {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  const filterInfo = await getSupervisorFilterInfo();
  // Perímetro: sin RLS, el listado se acota SIEMPRE a la empresa activa.
  const companyId = await getActiveCompanyId();

  try {
    const whereClause: {
      status: string;
      company_id: string;
      maintenance_requests?: { supervisor_id: string };
    } = withCompany({ status: 'in_workshop' }, companyId);

    if (filterInfo?.shouldFilterBySupervisor) {
      whereClause.maintenance_requests = { supervisor_id: filterInfo.userId };
    }

    const orders = await prisma.maintenance_orders.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      include: {
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            condition: true,
            kilometer: true,
            engine_hours: true,
            type_vehicles_typeTotype: { select: { id: true, name: true } },
          },
        },
        // Ticket 596: el pedido puede apuntar a un equipamiento en vez de a un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            company_id: true,
            condition: true,
            horometer: true,
            type: { select: { id: true, name: true } },
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            created_at: true,
            supervisor_id: true,
            source: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: {
            profile_maintenance_order_items_rejected_byToprofile: {
              select: { id: true, fullname: true },
            },
            profile_maintenance_order_items_workshop_chief_comment_byToprofile: {
              select: { id: true, fullname: true },
            },
            maintenance_request_items: {
              include: {
                profile_maintenance_request_items_driver_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                profile_maintenance_request_items_validator_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                profile_maintenance_request_items_supervisor_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                checklist_deviations: {
                  select: {
                    id: true,
                    item_code: true,
                    item_label: true,
                    section_code: true,
                    driver_comment: true,
                  },
                },
                // Grupo del que salio la reparacion: al expandir un grupo entran
                // muchos items de golpe y el taller necesita distinguirlos.
                maintenance_request_groups: { select: { id: true, name: true } },
              },
            },
            types_of_repairs: { select: { id: true, name: true, autorizable: true } },
            maintenance_order_item_repair_types: {
              include: {
                types_of_repairs: { select: { id: true, name: true, autorizable: true } },
              },
            },
            workshop_sectors: { select: { id: true, name: true } },
            maintenance_request_groups: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Mapear para compatibilidad con componentes existentes
    return orders.map((order) => ({
      ...order,
      vehicles: order.vehicles
        ? {
            ...order.vehicles,
            vehicle_type: order.vehicles.type_vehicles_typeTotype,
          }
        : null,
      other_equipment: order.other_equipment ? serializeOtherEquipment(order.other_equipment) : null,
      maintenance_requests: order.maintenance_requests
        ? {
            ...order.maintenance_requests,
            supervisor_name:
              order.maintenance_requests.profile_maintenance_requests_supervisor_idToprofile?.fullname || null,
          }
        : null,
      maintenance_order_items: order.maintenance_order_items.map((item) => ({
        ...item,
        rejected_by_profile: item.profile_maintenance_order_items_rejected_byToprofile,
        workshop_chief_comment_profile: item.profile_maintenance_order_items_workshop_chief_comment_byToprofile,
        maintenance_request_items: item.maintenance_request_items
          ? {
              id: item.maintenance_request_items.id,
              maintenance_request_id: item.maintenance_request_items.maintenance_request_id,
              checklist_deviation_id: item.maintenance_request_items.checklist_deviation_id,
              repair_type_id: item.maintenance_request_items.repair_type_id,
              status: item.maintenance_request_items.status,
              rejection_reason: item.maintenance_request_items.rejection_reason,
              created_at: item.maintenance_request_items.created_at,
              description: item.maintenance_request_items.description,
              // Ticket 592: el wizard arma el titulo con `free_text` y muestra las
              // fotos que cargo el supervisor. Este re-mapeo enumeraba los campos a
              // mano y los dejaba afuera, por eso el modal de gestion no mostraba
              // NINGUNA foto aunque la query ya las traia.
              free_text: item.maintenance_request_items.free_text,
              images: item.maintenance_request_items.images,
              maintenance_group_id: item.maintenance_request_items.maintenance_group_id,
              maintenance_request_groups: item.maintenance_request_items.maintenance_request_groups,
              driver_comment: item.maintenance_request_items.driver_comment,
              validator_comment: item.maintenance_request_items.validator_comment,
              driver_comment_by: item.maintenance_request_items.driver_comment_by,
              validator_comment_by: item.maintenance_request_items.validator_comment_by,
              supervisor_comment: item.maintenance_request_items.supervisor_comment,
              supervisor_comment_by: item.maintenance_request_items.supervisor_comment_by,
              checklist_deviations: item.maintenance_request_items.checklist_deviations,
              driver_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_driver_comment_byToprofile,
              validator_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_validator_comment_byToprofile,
              supervisor_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_supervisor_comment_byToprofile,
            }
          : null,
      })),
    }));
  } catch (error) {
    logger.error('Error al obtener pedidos para gestion', { data: { error } });
    throw error;
  }
}

export type OrderManagementData = Awaited<ReturnType<typeof getMaintenanceOrdersForManagement>>;
export type OrderManagementItem = OrderManagementData[number];

/**
 * Obtiene un pedido específico con el detalle necesario para la gestión.
 * Usado desde Órdenes de Mantenimiento al hacer click en "Gestionar".
 */
export async function getOrderForManagement(orderId: string) {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  // Perímetro: el pedido tiene que ser de la empresa activa.
  const companyId = await getActiveCompanyId();

  try {
    const order = await prisma.maintenance_orders.findFirst({
      where: withCompany({ id: orderId }, companyId),
      include: {
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            condition: true,
            kilometer: true,
            engine_hours: true,
            type_vehicles_typeTotype: { select: { id: true, name: true } },
          },
        },
        // Ticket 596: el pedido puede apuntar a un equipamiento en vez de a un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            company_id: true,
            condition: true,
            horometer: true,
            type: { select: { id: true, name: true } },
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            created_at: true,
            supervisor_id: true,
            source: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: {
            profile_maintenance_order_items_rejected_byToprofile: {
              select: { id: true, fullname: true },
            },
            profile_maintenance_order_items_workshop_chief_comment_byToprofile: {
              select: { id: true, fullname: true },
            },
            maintenance_request_items: {
              include: {
                profile_maintenance_request_items_driver_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                profile_maintenance_request_items_validator_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                profile_maintenance_request_items_supervisor_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                checklist_deviations: {
                  select: {
                    id: true,
                    item_code: true,
                    item_label: true,
                    section_code: true,
                    driver_comment: true,
                  },
                },
                // Grupo del que salio la reparacion: al expandir un grupo entran
                // muchos items de golpe y el taller necesita distinguirlos.
                maintenance_request_groups: { select: { id: true, name: true } },
              },
            },
            types_of_repairs: { select: { id: true, name: true, autorizable: true } },
            maintenance_order_item_repair_types: {
              include: {
                types_of_repairs: { select: { id: true, name: true, autorizable: true } },
              },
            },
            workshop_sectors: { select: { id: true, name: true } },
            maintenance_request_groups: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Orden no encontrada');
    }

    // Mapear para compatibilidad con componentes existentes
    return {
      ...order,
      vehicles: order.vehicles
        ? {
            ...order.vehicles,
            vehicle_type: order.vehicles.type_vehicles_typeTotype,
          }
        : null,
      other_equipment: order.other_equipment ? serializeOtherEquipment(order.other_equipment) : null,
      maintenance_requests: order.maintenance_requests
        ? {
            ...order.maintenance_requests,
            supervisor_name:
              order.maintenance_requests.profile_maintenance_requests_supervisor_idToprofile?.fullname || null,
          }
        : null,
      maintenance_order_items: order.maintenance_order_items.map((item) => ({
        ...item,
        rejected_by_profile: item.profile_maintenance_order_items_rejected_byToprofile,
        workshop_chief_comment_profile: item.profile_maintenance_order_items_workshop_chief_comment_byToprofile,
        maintenance_request_items: item.maintenance_request_items
          ? {
              id: item.maintenance_request_items.id,
              maintenance_request_id: item.maintenance_request_items.maintenance_request_id,
              checklist_deviation_id: item.maintenance_request_items.checklist_deviation_id,
              repair_type_id: item.maintenance_request_items.repair_type_id,
              status: item.maintenance_request_items.status,
              rejection_reason: item.maintenance_request_items.rejection_reason,
              created_at: item.maintenance_request_items.created_at,
              description: item.maintenance_request_items.description,
              // Ticket 592: el wizard arma el titulo con `free_text` y muestra las
              // fotos que cargo el supervisor. Este re-mapeo enumeraba los campos a
              // mano y los dejaba afuera, por eso el modal de gestion no mostraba
              // NINGUNA foto aunque la query ya las traia.
              free_text: item.maintenance_request_items.free_text,
              images: item.maintenance_request_items.images,
              maintenance_group_id: item.maintenance_request_items.maintenance_group_id,
              maintenance_request_groups: item.maintenance_request_items.maintenance_request_groups,
              driver_comment: item.maintenance_request_items.driver_comment,
              validator_comment: item.maintenance_request_items.validator_comment,
              driver_comment_by: item.maintenance_request_items.driver_comment_by,
              validator_comment_by: item.maintenance_request_items.validator_comment_by,
              supervisor_comment: item.maintenance_request_items.supervisor_comment,
              supervisor_comment_by: item.maintenance_request_items.supervisor_comment_by,
              checklist_deviations: item.maintenance_request_items.checklist_deviations,
              driver_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_driver_comment_byToprofile,
              validator_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_validator_comment_byToprofile,
              supervisor_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_supervisor_comment_byToprofile,
            }
          : null,
      })),
    };
  } catch (error) {
    logger.error('Error al obtener pedido para gestion', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Obtiene todos los sectores activos de todos los talleres
 */
export async function getActiveWorkshopSectors() {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  const companyId = await getActiveCompanyId();

  try {
    const sectors = await prisma.workshop_sectors.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true, workshop_id: true, max_capacity: true },
      orderBy: { name: 'asc' },
    });

    return sectors;
  } catch (error) {
    logger.error('Error al obtener sectores', { data: { error } });
    throw error;
  }
}

export type WorkshopSector = Awaited<ReturnType<typeof getActiveWorkshopSectors>>[number];

/**
 * Obtiene talleres externos activos
 */
export async function getActiveExternalWorkshops() {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  const companyId = await getActiveCompanyId();

  try {
    const workshops = await prisma.workshops.findMany({
      where: withCompany({ type: 'externo' as const, is_active: true }, companyId),
      select: { id: true, name: true, provider_name: true },
      orderBy: { name: 'asc' },
    });

    return workshops;
  } catch (error) {
    logger.error('Error al obtener talleres externos', { data: { error } });
    throw error;
  }
}

export type ExternalWorkshop = Awaited<ReturnType<typeof getActiveExternalWorkshops>>[number];

// =============================================================================
// MUTATIONS

/**
 * Retorna un resumen agrupado por sector de los items listos para generar OT.
 * Solo incluye items regulares (no diagnostico) que tienen sector asignado.
 */
export async function getOrderGenerationPreview(orderId: string) {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  // Perímetro: el pedido tiene que ser de la empresa activa.
  const companyId = await getActiveCompanyId();

  try {
    const order = await prisma.maintenance_orders.findFirst({
      where: withCompany({ id: orderId }, companyId),
      select: {
        id: true,
        equipment_id: true,
        // Ticket 596: el pedido puede apuntar a un equipamiento en vez de a un vehiculo
        other_equipment_id: true,
        vehicles: {
          select: { id: true, domain: true, serie: true, intern_number: true, company_id: true },
        },
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            company_id: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_order_items: {
          select: {
            id: true,
            description: true,
            assigned_sector_id: true,
            assigned_workshop_id: true,
            sector_sequence_order: true,
            is_diagnostico: true,
            is_rejected: true,
            work_order_id: true,
            workshop_sectors: { select: { id: true, name: true } },
            workshops: { select: { id: true, name: true, type: true } },
            maintenance_order_item_repair_types: {
              include: {
                types_of_repairs: { select: { id: true, name: true, autorizable: true } },
              },
            },
            types_of_repairs: { select: { id: true, name: true, autorizable: true } },
          },
        },
      },
    });

    if (!order) {
      logger.error('Error obteniendo preview de generacion', { data: { orderId } });
      throw new Error('Error al obtener datos de la orden');
    }

    // Items regulares sin OT generada, no rechazados y con destino asignado.
    const eligibleItems = order.maintenance_order_items.filter(isEligibleForWorkOrder);

    // Agrupar por sector (internos) o por taller externo. La regla vive en
    // `lib/work-order-generation.ts` (pura, con tests): un grupo = una OT.
    const sectorMap = groupItemsBySector(eligibleItems);

    return {
      orderId: order.id,
      equipmentId: order.equipment_id,
      otherEquipmentId: order.other_equipment_id,
      vehicle: order.vehicles,
      otherEquipment: order.other_equipment ? serializeOtherEquipment(order.other_equipment) : null,
      sectors: Array.from(sectorMap.values()),
    };
  } catch (error) {
    logger.error('Error obteniendo preview de generacion', { data: { error, orderId } });
    throw error;
  }
}

export type OrderGenerationPreview = Awaited<ReturnType<typeof getOrderGenerationPreview>>;

/**
 * Obtiene los sectores candidatos para cada repair type usando la tabla sector_repair_types.
 * Retorna un map de repairTypeId → sectorIds[]
 */
export async function getSectorCandidatesForRepairTypes(repairTypeIds: string[]) {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  if (repairTypeIds.length === 0) return [];
  // Perímetro: tipos y sectores tienen que ser de la empresa activa (los ids llegan del cliente).
  const companyId = await getActiveCompanyId();

  try {
    const data = await prisma.sector_repair_types.findMany({
      where: {
        repair_type_id: { in: repairTypeIds },
        types_of_repairs: { company_id: companyId },
        workshop_sectors: { company_id: companyId },
      },
      select: {
        workshop_sector_id: true,
        repair_type_id: true,
        workshop_sectors: { select: { id: true, name: true } },
      },
    });

    return data;
  } catch (error) {
    logger.error('Error obteniendo candidatos de sector', { data: { error } });
    throw error;
  }
}

export type SectorCandidateData = Awaited<ReturnType<typeof getSectorCandidatesForRepairTypes>>;

// =============================================================================
// WIZARD: BATCH SETUP + GENERATE WORK ORDERS
// =============================================================================

/**
 * Devuelve los Grupos de Tareas activos con sus tipos de reparacion asociados.
 * Se utiliza en el dialogo de agregar items para que el usuario pueda elegir un
 * grupo y pre-tildar todas sus tareas, con la posibilidad de destildar las que
 * no quiera cargar antes de confirmar.
 */
export async function getMaintenanceTaskGroupsWithRepairTypes() {
  // Permiso de lectura (gestión de órdenes o las tabs que montan este mismo detalle).
  await requireOrderManagementReadAccess();
  logger.debug('Obteniendo grupos de tareas con repair_types');

  try {
    const companyId = await getActiveCompanyId();

    const groups = await prisma.maintenance_request_groups.findMany({
      where: { is_active: true, company_id: companyId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        maintenance_group_type_of_repairs: {
          select: {
            types_of_repairs: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      repairTypes: g.maintenance_group_type_of_repairs
        .map((rel) => rel.types_of_repairs)
        .filter((rt): rt is { id: string; name: string } => rt !== null),
    }));
  } catch (error) {
    logger.error('Error al obtener grupos de tareas', { data: { error } });
    throw error;
  }
}

export type MaintenanceTaskGroupsWithRepairTypes = Awaited<ReturnType<typeof getMaintenanceTaskGroupsWithRepairTypes>>;
export type MaintenanceTaskGroupWithRepairTypes = MaintenanceTaskGroupsWithRepairTypes[number];
