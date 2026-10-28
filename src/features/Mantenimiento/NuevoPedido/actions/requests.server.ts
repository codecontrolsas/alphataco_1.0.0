'use server';
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
import type { CreateDeviationFromNuevoPedido } from './orders.server';

const serverLogger = new Logger('Mantenimiento/NuevoPedido/requests');

/**
 * Crea una solicitud de mantenimiento con status pending_approval
 * (para cuando el creador NO es el supervisor).
 *
 * Flujo (dentro de $transaction):
 * 1. Crea checklist_deviations (con Promise.all para obtener IDs)
 * 2. Crea maintenance_request con status 'pending_approval'
 * 3. Crea maintenance_request_items vinculados a los desvíos
 * 4. Registra la actividad en maintenance_activity_log
 *
 * NO crea maintenance_order — eso se hace cuando el supervisor aprueba.
 */
export async function createMaintenanceRequestPendingApproval(input: {
  equipmentId: string;
  supervisorId: string;
  kilometer?: string;
  engine_hours?: string;
  deviations?: CreateDeviationFromNuevoPedido[];
  /** ID del template del checklist desde donde se eligieron los desvíos. Necesario para que el
   * filtro de items "no propagables" (matriz checklist × item) funcione al aprobar en validate. */
  templateId?: string;
  source?: 'preventive';
  preventiveType?: PreventiveType;
  driverEmployeeId?: string;
  /** Vehiculo o equipamiento (ticket 596). Por defecto, vehiculo */
  resourceKind?: MaintenanceResourceKind;
  /** Ítems manuales (texto libre, no del template) */
  manualItems?: Array<{ label: string }>;
  /** Descripción libre de la solicitud (utilizada cuando el origen es preventivo) */
  description?: string;
}) {
  serverLogger.info('Creando solicitud de mantenimiento pendiente de aprobación', {
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
    const { request } = await withMaintenanceActor(profile.id, async (tx) => {
      const request = await tx.maintenance_requests.create({
        data: {
          ...resourceIdFields(input.resourceKind, input.equipmentId),
          company_id: companyId,
          supervisor_id: input.supervisorId,
          status: 'pending_approval',
          user_id: profile.id,
          kilometer: input.kilometer ?? null,
          source: 'preventive',
          preventive_type: input.preventiveType!,
          description: input.description?.trim() || null,
        },
      });

      await logActivity(tx, {
        maintenanceRequestId: request.id,
        actionType: ACTIVITY_LOG.CREATED,
        performedBy: profile.id,
        notes: `Solicitud de mantenimiento preventivo creada: ${input.preventiveType} - Pendiente de aprobación`,
        metadata: {
          source: 'preventive',
          preventive_type: input.preventiveType,
          supervisor_id: input.supervisorId,
          requires_approval: true,
        },
      });

      return { request };
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

    serverLogger.info('Solicitud preventiva creada - Pendiente de aprobación', {
      data: { requestId: request.id, preventiveType: input.preventiveType },
    });

    await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceRequestPendingApproval);
    return { request, requestItems: [] };
  }

  const pendingDeviations = input.deviations ?? [];

  const { request, requestItems } = await withMaintenanceActor(profile.id, async (tx) => {
    // 1a. Crear checklist_answers "stub" para vincular los desvíos al template.
    //     Esto permite que el filtro de items "no propagables" pueda inferir el
    //     template_id al aprobar la solicitud en validate (paso 1 de Operaciones).
    //     `result='M'` porque hay desvíos (constraint de BD: solo 'B'|'M'). El
    //     campo `observations` deja constancia de que es un stub, no una respuesta
    //     real del checklist, para distinguirlo en reportes/auditorías.
    let stubAnswerId: string | null = null;
    if (input.templateId && pendingDeviations.length > 0) {
      const stub = await tx.checklist_answers.create({
        data: {
          template_id: input.templateId,
          equipment_id: input.equipmentId,
          company_id: companyId,
          user_id: profile.id,
          answer_data: {},
          result: 'M',
          observations: 'Stub generado desde Nuevo Pedido (sin respuesta real al checklist).',
        },
        select: { id: true },
      });
      stubAnswerId = stub.id;
    }

    // 1b. Crear checklist_deviations con Promise.all para obtener los IDs
    const createdDeviations = await Promise.all(
      pendingDeviations.map((d) =>
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
            checklist_answer_id: stubAnswerId,
          },
        })
      )
    );

    // 2. Crear maintenance_request con status pending_approval (NO aprobado aún)
    const request = await tx.maintenance_requests.create({
      data: {
        equipment_id: input.equipmentId,
        company_id: companyId,
        supervisor_id: input.supervisorId,
        status: 'pending_approval',
        user_id: profile.id,
        kilometer: input.kilometer ?? null,
        source: 'manual',
        driver_employee_id: input.driverEmployeeId ?? null,
        // Sin approved_by ni approved_at ya que está pendiente
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
            status: 'pending',
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

    // 4. Registrar actividad en maintenance_activity_log
    await logActivity(tx, {
      maintenanceRequestId: request.id,
      actionType: ACTIVITY_LOG.CREATED,
      performedBy: profile.id,
      notes: 'Solicitud creada manualmente desde Nuevo Pedido - Pendiente de aprobación del supervisor',
      metadata: {
        source: 'manual',
        supervisor_id: input.supervisorId,
        deviations_count: pendingDeviations.length,
        requires_approval: true,
      },
    });

    // 5. Crear ítems manuales (texto libre, no del template)
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
        await tx.maintenance_request_items.createMany({
          data: manualDevs.map((d) => ({
            maintenance_request_id: request.id,
            company_id: companyId,
            checklist_deviation_id: d.id,
            repair_type_id: null,
            driver_comment: null,
            status: 'pending',
          })),
        });
      }
    }

    return { request, requestItems };
  });

  // 5. Actualizar kilometraje y horómetro del vehículo (fuera de transacción — es warning, no crítico)
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

  serverLogger.info('Solicitud creada exitosamente - Pendiente de aprobación', {
    data: {
      requestId: request.id,
      deviationsCount: pendingDeviations.length,
      supervisorId: input.supervisorId,
    },
  });

  await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceRequestPendingApproval);

  return { request, requestItems };
}

/**
 * Crea una solicitud de mantenimiento por CARGA MANUAL (ticket 592).
 *
 * A diferencia del flujo de checklist, acá las reparaciones se cargan directamente:
 * cada item puede apuntar a un tipo de reparacion del sistema (`repairTypeId`) o
 * ser texto libre (`freeText`) cuando el solicitante no encuentra la tarea que
 * necesita — en ese caso el taller la asocia despues al tipo que corresponda.
 *
 * Los items NO tienen checklist_deviation_id: la columna es nullable desde este
 * ticket, justamente porque este camino no parte de ninguna inspeccion.
 *
 * Las imagenes llegan como URLs ya subidas al bucket 'repair-images' desde el
 * cliente; acá solo se persisten.
 */
export async function createManualMaintenanceRequest(input: {
  equipmentId: string;
  supervisorId: string;
  kilometer?: string;
  engine_hours?: string;
  driverEmployeeId?: string;
  /** Vehiculo o equipamiento (ticket 596). Por defecto, vehiculo */
  resourceKind?: MaintenanceResourceKind;
  /**
   * El usuario que carga ES el supervisor: la solicitud queda aprobada y genera
   * el pedido de una, igual que en los caminos de checklist y preventivo.
   */
  autoApprove?: boolean;
  repairs: Array<{
    repairTypeId: string | null;
    freeText: string | null;
    description: string;
    images: string[];
    /**
     * Grupo de reparaciones del que salió esta tarea, o null si se cargó suelta.
     * Se guarda para poder indicar el origen en todos los listados: al expandir un
     * grupo entran muchas tareas de golpe y después nadie distingue cuáles fueron
     * elegidas a propósito.
     */
    groupId?: string | null;
  }>;
}) {
  serverLogger.info('Creando solicitud de mantenimiento por carga manual', {
    data: {
      equipmentId: input.equipmentId,
      supervisorId: input.supervisorId,
      repairsCount: input.repairs.length,
    },
  });

  if (input.repairs.length === 0) {
    throw new Error('Debe incluirse al menos una reparación');
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

  const autoApprove = input.autoApprove === true;

  try {
    const request = await withMaintenanceActor(profile.id, async (tx) => {
      const created = await tx.maintenance_requests.create({
        data: {
          ...resourceIdFields(input.resourceKind, input.equipmentId),
          company_id: companyId,
          supervisor_id: input.supervisorId,
          status: autoApprove ? 'approved' : 'pending_approval',
          ...(autoApprove ? { approved_by: profile.id, approved_at: new Date() } : {}),
          user_id: profile.id,
          kilometer: input.kilometer ?? null,
          engine_hours: input.engine_hours ?? null,
          driver_employee_id: input.driverEmployeeId ?? null,
          source: 'manual',
        },
      });

      await tx.maintenance_request_items.createMany({
        data: input.repairs.map((repair) => ({
          maintenance_request_id: created.id,
          company_id: companyId,
          checklist_deviation_id: null,
          repair_type_id: repair.repairTypeId,
          free_text: repair.freeText,
          description: repair.description || null,
          images: repair.images,
          maintenance_group_id: repair.groupId ?? null,
          status: autoApprove ? 'approved' : 'pending',
        })),
      });

      // Quien carga es el supervisor: el pedido se genera en el acto, sin pasar
      // por la validación de Operaciones.
      if (autoApprove) {
        const order = await tx.maintenance_orders.create({
          data: {
            ...resourceIdFields(input.resourceKind, input.equipmentId),
            company_id: companyId,
            maintenance_request_id: created.id,
            status: 'pending_scheduling',
            kilometer_at_entry: input.kilometer ?? null,
            engine_hours_at_entry: input.engine_hours ?? null,
            source: 'manual',
          },
        });

        // Los items del pedido se cuelgan de los de la solicitud, para conservar
        // la trazabilidad y arrastrar las fotos sin transformarlas.
        const requestItems = await tx.maintenance_request_items.findMany({
          where: { maintenance_request_id: created.id },
          select: {
            id: true,
            repair_type_id: true,
            description: true,
            free_text: true,
            images: true,
            maintenance_group_id: true,
          },
        });

        await tx.maintenance_order_items.createMany({
          data: requestItems.map((item) => ({
            maintenance_order_id: order.id,
            company_id: companyId,
            maintenance_request_item_id: item.id,
            repair_type_id: item.repair_type_id,
            // Sin tipo de reparación, el texto libre es lo único que describe la tarea
            description: item.description ?? item.free_text ?? null,
            images: item.images,
            // El origen viaja del item de la solicitud al del pedido: el taller ve
            // la misma agrupación que vio quien cargó
            maintenance_group_id: item.maintenance_group_id,
          })),
        });

        await logActivity(tx, {
          maintenanceRequestId: created.id,
          maintenanceOrderId: order.id,
          actionType: ACTIVITY_LOG.CREATED,
          performedBy: profile.id,
          notes: 'Pedido creado por carga manual',
          metadata: { source: 'manual', supervisor_id: input.supervisorId },
        });
      }

      return created;
    });

    serverLogger.info('Solicitud manual creada', {
      data: { requestId: request.id, itemsCount: input.repairs.length, autoApprove },
    });

    await invalidateCacheTags(INVALIDATION_MAP.createMaintenanceRequest);

    return request;
  } catch (error) {
    serverLogger.error('Error al crear solicitud manual', {
      data: { error, equipmentId: input.equipmentId },
    });
    throw error;
  }
}
