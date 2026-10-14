'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { ORDER_DETAIL_VIEW_TABS, requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { assertOrderInActiveCompany } from './order-perimeter';

const logger = new Logger('MaintenanceOrders/queries');

/**
 * Obtiene el detalle completo de una orden, con items agrupados por sector.
 */
export async function getMaintenanceOrderDetail(orderId: string) {
  // Se abre desde seguimiento, bandeja de aprobaciones y órdenes: `view` en cualquiera de ellas.
  await requireMaintenancePermission(ORDER_DETAIL_VIEW_TABS, 'view');
  // Perímetro: el pedido tiene que ser de la empresa activa.
  const companyId = await assertOrderInActiveCompany(orderId);
  logger.debug('Obteniendo detalle de orden de mantenimiento', { data: { orderId } });

  try {
    const order = await prisma.maintenance_orders.findFirst({
      where: { id: orderId, company_id: companyId },
      select: {
        id: true,
        maintenance_request_id: true,
        equipment_id: true,
        status: true,
        scheduled_date: true,
        scheduled_by: true,
        scheduled_at: true,
        rejection_reason: true,
        rejected_by: true,
        rejected_at: true,
        workshop_entry_date: true,
        workshop_approved_by: true,
        kilometer_at_entry: true,
        created_at: true,
        updated_at: true,
        date_approved_at: true,
        date_approved_by: true,
        date_rejected_at: true,
        date_rejected_by: true,
        date_rejection_reason: true,
        source: true,
        order_number: true,
        workshop_validated_at: true,
        workshop_validation_notes: true,
        operations_validated_by: true,
        operations_validated_at: true,
        operations_validation_notes: true,
        engine_hours_at_entry: true,
        description: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            condition: true,
            type_vehicles_typeTotype: { select: { id: true, name: true } },
          },
        },
        // Ticket 596: la orden puede ser de un equipamiento en vez de un vehículo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            created_at: true,
            source: true,
            preventive_type: true,
            supervisor_id: true,
            description: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          select: {
            id: true,
            maintenance_order_id: true,
            maintenance_request_item_id: true,
            repair_type_id: true,
            description: true,
            images: true,
            created_at: true,
            assigned_at: true,
            assigned_by: true,
            assigned_sector_id: true,
            assigned_workshop_id: true,
            planned_end_date: true,
            planned_start_date: true,
            work_order_id: true,
            is_critical: true,
            sector_sequence_order: true,
            is_diagnostico: true,
            workshop_chief_comment: true,
            is_rejected: true,
            rejection_reason: true,
            rejected_by: true,
            rejected_at: true,
            workshop_chief_comment_by: true,
            types_of_repairs: { select: { id: true, name: true, autorizable: true } },
            maintenance_order_item_repair_types: {
              select: { types_of_repairs: { select: { id: true, name: true } } },
            },
            // El cliente pidio que la agrupacion de tareas se vea en TODO listado
            // de items, asi que el nombre del grupo de origen viaja con el item.
            maintenance_group_id: true,
            maintenance_request_groups: { select: { id: true, name: true } },
            workshop_sectors: { select: { id: true, name: true } },
            workshops: { select: { id: true, name: true, type: true } },
            work_orders: { select: { id: true, order_number: true, status: true, priority: true } },
            profile_maintenance_order_items_rejected_byToprofile: { select: { id: true, fullname: true } },
            profile_maintenance_order_items_workshop_chief_comment_byToprofile: {
              select: { id: true, fullname: true },
            },
            maintenance_request_items: {
              select: {
                driver_comment: true,
                validator_comment: true,
                description: true,
                // Ticket 592: título y fotos de un ítem cargado a mano (sin desvío de checklist)
                free_text: true,
                images: true,
                supervisor_comment: true,
                supervisor_comment_by: true,
                driver_comment_by: true,
                validator_comment_by: true,
                profile_maintenance_request_items_driver_comment_byToprofile: { select: { id: true, fullname: true } },
                profile_maintenance_request_items_validator_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                profile_maintenance_request_items_supervisor_comment_byToprofile: {
                  select: { id: true, fullname: true },
                },
                checklist_deviations: { select: { id: true, item_code: true, item_label: true } },
                // Grupo de origen del item de la solicitud: el badge de grupo lo
                // busca aca cuando el item de la orden no lo trae propio.
                maintenance_request_groups: { select: { name: true } },
              },
            },
            work_order_items: {
              select: {
                id: true,
                status: true,
                maintenance_order_item_id: true,
                work_order_item_repairs: {
                  select: {
                    id: true,
                    status: true,
                    repair_type_id: true,
                    is_diagnostico: true,
                    is_operator_added: true,
                    rejection_reason: true,
                    technician_notes: true,
                    profile_work_order_item_repairs_technician_notes_byToprofile: {
                      select: { id: true, fullname: true },
                    },
                    types_of_repairs: { select: { id: true, name: true, autorizable: true, criticity: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return null;

    // Mapear alias de relaciones para compatibilidad con componentes
    return {
      ...order,
      vehicles: order.vehicles
        ? {
            id: order.vehicles.id,
            domain: order.vehicles.domain,
            serie: order.vehicles.serie,
            intern_number: order.vehicles.intern_number,
            kilometer: order.vehicles.kilometer,
            condition: order.vehicles.condition,
            vehicle_type: order.vehicles.type_vehicles_typeTotype,
          }
        : null,
      maintenance_order_items: order.maintenance_order_items.map((item) => ({
        ...item,
        rejected_by_profile: item.profile_maintenance_order_items_rejected_byToprofile,
        workshop_chief_comment_profile: item.profile_maintenance_order_items_workshop_chief_comment_byToprofile,
        maintenance_request_items: item.maintenance_request_items
          ? {
              ...item.maintenance_request_items,
              driver_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_driver_comment_byToprofile,
              validator_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_validator_comment_byToprofile,
              supervisor_comment_profile:
                item.maintenance_request_items.profile_maintenance_request_items_supervisor_comment_byToprofile,
            }
          : null,
        work_orders:
          item.work_order_items.length > 0
            ? {
                id: item.work_order_id,
                order_number: item.work_orders?.order_number ?? null,
                status: item.work_orders?.status ?? null,
                priority: item.work_orders?.priority ?? null,
                work_order_items: item.work_order_items.map((woi) => ({
                  ...woi,
                  work_order_item_repairs: woi.work_order_item_repairs.map((repair) => ({
                    ...repair,
                    technician_notes_profile: repair.profile_work_order_item_repairs_technician_notes_byToprofile,
                  })),
                })),
              }
            : null,
      })),
    };
  } catch (error) {
    logger.error('Error al obtener detalle de orden', { data: { error, orderId } });
    throw error;
  }
}

export type MaintenanceOrderDetailData = Awaited<ReturnType<typeof getMaintenanceOrderDetail>>;
// Orden con items, sectores y trabajos (forma que consumen los diálogos de detalle)
export type MaintenanceOrderData = NonNullable<MaintenanceOrderDetailData>;

/**
 * Get validation history for an order from maintenance_activity_log
 */
export async function getValidationHistory(orderId: string) {
  await requireMaintenancePermission(ORDER_DETAIL_VIEW_TABS, 'view');
  // Perímetro: el historial es del pedido de la empresa activa.
  await assertOrderInActiveCompany(orderId);
  logger.debug('Obteniendo historial de validaciones', { data: { orderId } });

  try {
    const logs = await prisma.maintenance_activity_log.findMany({
      where: {
        maintenance_order_id: orderId,
        action_type: {
          in: [
            'workshop_item_rejected',
            'operations_item_rejected',
            'workshop_agreed_ops_rejection',
            'workshop_disagreed_ops_rejection',
            'workshop_approved',
            'operations_approved',
            'workshop_rejected_all_items',
            'workshop_restored_from_rejected',
            'status_change',
          ],
        },
      },
      orderBy: { performed_at: 'desc' },
      select: {
        id: true,
        action_type: true,
        performed_at: true,
        previous_status: true,
        new_status: true,
        notes: true,
        rejection_reason: true,
        metadata: true,
        profile: { select: { id: true, fullname: true } },
      },
    });

    // Mapear alias para compatibilidad con componentes
    return logs.map((log) => ({
      ...log,
      performed_by_profile: log.profile,
    }));
  } catch (error) {
    logger.error('Error al obtener historial de validaciones', { data: { error, orderId } });
    throw error;
  }
}

export type ValidationHistoryData = Awaited<ReturnType<typeof getValidationHistory>>;
export type ValidationHistoryEntry = ValidationHistoryData[number];
