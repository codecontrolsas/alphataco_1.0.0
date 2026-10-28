'use server';

import { isNonPropagatingChecklistItem } from '@/features/Mantenimiento/constants/non-propagating-checklist-items';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { resourceIdFields, type MaintenanceResourceKind } from '@/features/Mantenimiento/shared/maintenance-resource';
import type { PreventiveType } from '@/features/Mantenimiento/shared/preventive-maintenance';
import { NUEVO_PEDIDO_CREATE, requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { assertSupervisorInCompany } from '@/features/Mantenimiento/shared/supervisor-perimeter';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';

const serverLogger = new Logger('Mantenimiento/NuevoPedido/orders');

/**
 * Tipo para crear desvíos desde el formulario de Nuevo Pedido
 */
export type CreateDeviationFromNuevoPedido = {
  itemId: string;
  itemCode: string;
  itemLabel: string;
  sectionCode: string;
  isCritical: boolean;
  comment?: string;
};

/**
 * Crea un pedido de mantenimiento desde desvíos seleccionados en el formulario de Nuevo Pedido.
 *
 * Flujo (dentro de $transaction):
 * 1. Crea checklist_deviations (con Promise.all para obtener IDs)
 * 2. Crea maintenance_request con status 'approved' (source='manual')
 * 3. Crea maintenance_request_items vinculados a los desvíos
 * 4. Crea maintenance_order con status 'pending_scheduling'
 * 5. Crea maintenance_order_items vinculados a los request_items
 * 6. Registra la actividad en maintenance_activity_log
 *
 * Fuera de la transacción: actualizar km del vehículo (es warning, no crítico)
 */
export async function createMaintenanceOrderFromDeviations(input: {
  equipmentId: string;
  supervisorId: string;
  kilometer?: string;
  engine_hours?: string;
  deviations?: CreateDeviationFromNuevoPedido[];
  /** ID del template del checklist desde donde se eligieron los desvíos. Usado para detectar items no-propagables. */
  templateId?: string;
  source?: 'preventive';
  preventiveType?: PreventiveType;
  driverEmployeeId?: string;
  /** Vehiculo o equipamiento (ticket 596). Por defecto, vehiculo */
  resourceKind?: MaintenanceResourceKind;
  /** Ítems manuales (texto libre, no del template) */
  manualItems?: Array<{ label: string }>;
  /** Descripción libre del pedido (utilizada cuando el origen es preventivo) */
  description?: string;
}) {
  serverLogger.info('Creando pedido desde Nuevo Pedido', {
    data: {
      equipmentId: input.equipmentId,
      supervisorId: input.supervisorId,
      deviationsCount: input.deviations?.length ?? 0,
      source: input.source,
      preventiveType: input.preventiveType,
    },
  });

  if (input.manualItems && input.manualItems.length > 0) {
    serverLogger.debug('Se incluyeron ítems manuales', {
      data: { count: input.manualItems.length },
    });
  }

  const profile = await requireServerAuthProfile();
  // Perímetro de dos caminos: operario del QR de esa empresa o usuario del dashboard con
  // `nuevo_pedido:create` en la empresa activa. La empresa sigue saliendo del recurso.
  const { companyId } = await requireResourceAccess(input.resourceKind, input.equipmentId, {
    dashboardPermissions: [NUEVO_PEDIDO_CREATE],
    modules: ['mantenimiento'],
  });
  // El supervisor llega del cliente: tiene que ser de la empresa del recurso.
  await assertSupervisorInCompany(input.supervisorId, companyId);

  const isPreventive = input.source === 'preventive' && input.preventiveType;

  if (isPreventive) {
    const { request, order } = await withMaintenanceActor(profile.id, async (tx) => {
      const request = await tx.maintenance_requests.create({
        data: {
          ...resourceIdFields(input.resourceKind, input.equipmentId),
          company_id: companyId,
          supervisor_id: input.supervisorId,
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date(),
          user_id: profile.id,
          kilometer: input.kilometer ?? null,
          source: 'preventive',
          preventive_type: input.preventiveType!,
          description: input.description?.trim() || null,
        },
      });

      const order = await tx.maintenance_orders.create({
        data: {
          ...resourceIdFields(input.resourceKind, input.equipmentId),
          company_id: companyId,
          maintenance_request_id: request.id,
          status: 'pending_scheduling',
          kilometer_at_entry: input.kilometer ?? null,
          source: 'preventive',
          preventive_type: input.preventiveType!,
          description: input.description?.trim() || null,
        },
      });

      await logActivity(tx, {
        maintenanceRequestId: request.id,
        maintenanceOrderId: order.id,
        actionType: ACTIVITY_LOG.CREATED,
        performedBy: profile.id,
        notes: `Pedido de mantenimiento preventivo creado: ${input.preventiveType}`,
        metadata: {
          source: 'preventive',
          preventive_type: input.preventiveType,
          supervisor_id: input.supervisorId,
        },
      });

      return { request, order };
    });

    // Actualizar kilometraje y horómetro del vehículo (fuera de transacción — es warning, no crítico)
    if (input.kilometer || input.engine_hours) {
      try {
        const currentVehicle = await prisma.vehicles.findUnique({
          where: { id: input.equipmentId },
          select: { kilometer: true, engine_hours: true },
        });

        const updateData: Record<string, unknown> = {};

        if (input.kilometer) {
          const currentKm = Number(currentVehicle?.kilometer) || 0;
          const newKm = Number(input.kilometer);
          if (newKm >= currentKm) {
            updateData.kilometer = input.kilometer;
          } else {
            serverLogger.warn('Kilometraje ignorado: menor al actual', {
              data: { newKm, currentKm, equipmentId: input.equipmentId },
            });
          }
        }

        if (input.engine_hours) {
          const currentHours = Number(currentVehicle?.engine_hours) || 0;
          const newHours = Number(input.engine_hours);
          if (newHours >= currentHours) {
            updateData.engine_hours = input.engine_hours;
          } else {
            serverLogger.warn('Horómetro ignorado: menor al actual', {
              data: { newHours, currentHours, equipmentId: input.equipmentId },
            });
          }
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.vehicles.update({ where: { id: input.equipmentId }, data: updateData });
        }
      } catch (vehicleError) {
        serverLogger.warn('No se pudo actualizar datos del vehículo', { data: { error: vehicleError } });
      }
    }

    serverLogger.info('Pedido preventivo creado exitosamente', {
      data: { requestId: request.id, orderId: order.id, preventiveType: input.preventiveType },
    });

    await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceOrderFromDeviations);
    return { request, order };
  }

  const deviations = input.deviations ?? [];

  const { request, order } = await withMaintenanceActor(profile.id, async (tx) => {
    // 1. Crear checklist_deviations con Promise.all para obtener los IDs
    const createdDeviations = await Promise.all(
      deviations.map((d) =>
        tx.checklist_deviations.create({
          data: {
            equipment_id: input.equipmentId,
            company_id: companyId,
            item_code: d.itemCode,
            item_label: d.itemLabel,
            section_code: d.sectionCode,
            is_critical: d.isCritical,
            driver_comment: d.comment ?? null,
            created_by_user_id: profile.id,
            // Sin checklist_answer_id porque es manual
          },
        })
      )
    );

    // 2. Crear maintenance_request con status aprobado y source='manual'
    const request = await tx.maintenance_requests.create({
      data: {
        equipment_id: input.equipmentId,
        company_id: companyId,
        supervisor_id: input.supervisorId,
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date(),
        user_id: profile.id,
        kilometer: input.kilometer ?? null,
        source: 'manual',
        driver_employee_id: input.driverEmployeeId ?? null,
      },
    });

    // 3. Crear maintenance_request_items vinculados a los desvíos
    // Si viene driverEmployeeId, el comentario es del chofer (desde mantenimiento).
    // Si no, es del supervisor (desde dashboard).
    const isFromDriver = !!input.driverEmployeeId;
    const requestItems = await Promise.all(
      createdDeviations.map((dev, idx) => {
        const comment = input.deviations?.[idx]?.comment ?? null;
        return tx.maintenance_request_items.create({
          data: {
            maintenance_request_id: request.id,
            company_id: companyId,
            checklist_deviation_id: dev.id,
            status: 'approved',
            description: comment,
            ...(isFromDriver
              ? {
                  driver_comment: comment,
                  driver_comment_by: comment ? profile.id : null,
                }
              : {
                  supervisor_comment: comment,
                  supervisor_comment_by: comment ? profile.id : null,
                }),
          },
        });
      })
    );

    // 4. Crear maintenance_order con source='manual'
    const order = await tx.maintenance_orders.create({
      data: {
        equipment_id: input.equipmentId,
        company_id: companyId,
        maintenance_request_id: request.id,
        status: 'pending_scheduling',
        kilometer_at_entry: input.kilometer ?? null,
        source: 'manual',
      },
    });

    // 5. Crear maintenance_order_items vinculados a request_items.
    //    Filtramos los items "no propagables" (matriz checklist × item): los desvíos
    //    quedan creados como registro pero no generan trabajo de taller.
    const propagatingOrderItems = requestItems
      .map((ri, idx) => {
        const itemCode = deviations[idx]?.itemCode ?? null;
        const isNonPropagating = isNonPropagatingChecklistItem(input.templateId ?? null, itemCode);
        return isNonPropagating
          ? null
          : {
              maintenance_order_id: order.id,
              company_id: companyId,
              maintenance_request_item_id: ri.id,
              description: deviations[idx]?.comment ?? null,
              is_critical: deviations[idx]?.isCritical ?? false,
            };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (propagatingOrderItems.length < requestItems.length) {
      serverLogger.info('Filtrando items no propagables al crear pedido (Nuevo Pedido / supervisor)', {
        data: {
          total: requestItems.length,
          propagating: propagatingOrderItems.length,
          skipped: requestItems.length - propagatingOrderItems.length,
        },
      });
    }

    if (propagatingOrderItems.length > 0) {
      await tx.maintenance_order_items.createMany({ data: propagatingOrderItems });
    }

    // 6. Registrar actividad en maintenance_activity_log
    await logActivity(tx, {
      maintenanceRequestId: request.id,
      maintenanceOrderId: order.id,
      actionType: ACTIVITY_LOG.CREATED,
      performedBy: profile.id,
      notes: 'Pedido creado manualmente desde Nuevo Pedido',
      metadata: {
        source: 'manual',
        supervisor_id: input.supervisorId,
        deviations_count: deviations.length,
      },
    });

    // 7. Crear ítems manuales (texto libre, no del template)
    if (input.manualItems && input.manualItems.length > 0) {
      const manualDevs = await Promise.all(
        input.manualItems
          .filter((m) => m.label.trim().length > 0)
          .map((m) =>
            tx.checklist_deviations.create({
              data: {
                checklist_answer_id: null,
                equipment_id: input.equipmentId,
                company_id: companyId,
                item_code: 'manual',
                item_label: m.label.trim(),
                section_code: null,
                is_critical: false,
                created_by_user_id: profile.id,
              },
              select: { id: true },
            })
          )
      );

      if (manualDevs.length > 0) {
        const manualRequestItems = await Promise.all(
          manualDevs.map((d) =>
            tx.maintenance_request_items.create({
              data: {
                maintenance_request_id: request.id,
                company_id: companyId,
                checklist_deviation_id: d.id,
                repair_type_id: null,
                driver_comment: null,
                status: 'pending',
              },
              select: { id: true },
            })
          )
        );

        await tx.maintenance_order_items.createMany({
          data: manualRequestItems.map((ri) => ({
            maintenance_order_id: order.id,
            company_id: companyId,
            maintenance_request_item_id: ri.id,
            description: null,
            is_critical: false,
          })),
        });
      }
    }

    return { request, order };
  });

  // 7. Actualizar kilometraje y horómetro del vehículo (fuera de transacción — es warning, no crítico)
  if (input.kilometer || input.engine_hours) {
    try {
      const currentVehicle = await prisma.vehicles.findUnique({
        where: { id: input.equipmentId },
        select: { kilometer: true, engine_hours: true },
      });

      const updateData: Record<string, unknown> = {};

      if (input.kilometer) {
        const currentKm = Number(currentVehicle?.kilometer) || 0;
        const newKm = Number(input.kilometer);
        if (newKm >= currentKm) {
          updateData.kilometer = input.kilometer;
        } else {
          serverLogger.warn('Kilometraje ignorado: menor al actual', {
            data: { newKm, currentKm, equipmentId: input.equipmentId },
          });
        }
      }

      if (input.engine_hours) {
        const currentHours = Number(currentVehicle?.engine_hours) || 0;
        const newHours = Number(input.engine_hours);
        if (newHours >= currentHours) {
          updateData.engine_hours = input.engine_hours;
        } else {
          serverLogger.warn('Horómetro ignorado: menor al actual', {
            data: { newHours, currentHours, equipmentId: input.equipmentId },
          });
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.vehicles.update({
          where: { id: input.equipmentId },
          data: updateData,
        });
      }
    } catch (vehicleError) {
      serverLogger.warn('No se pudo actualizar datos del vehículo', {
        data: { error: vehicleError },
      });
    }
  }

  serverLogger.info('Pedido creado exitosamente desde Nuevo Pedido', {
    data: {
      requestId: request.id,
      orderId: order.id,
      deviationsCount: deviations.length,
    },
  });

  await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceOrderFromDeviations);

  return { request, order };
}
