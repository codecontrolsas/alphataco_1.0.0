'use server';

import { checkMultiplePermissionsServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cacheLife, cacheTag } from 'next/cache';
import { ACTIVITY_LOG_SELECT, getRequestItemComments, mapActivityLogEntry } from './operations-select';

const serverLogger = new Logger('Operaciones/activity-log');

/**
 * Tabs desde las que se abre el historial (ActivityHistoryModal): leerlo exige `view` en alguna.
 * Incluye la ficha del equipo (Equipos > Historial de mantenimiento).
 */
const ACTIVITY_LOG_VIEW_TABS = [
  { moduleSlug: 'mantenimiento', tabSlug: 'maintenance_requests' },
  { moduleSlug: 'mantenimiento', tabSlug: 'seguimiento_taller' },
  { moduleSlug: 'mantenimiento', tabSlug: 'maintenance_orders' },
  { moduleSlug: 'mantenimiento', tabSlug: 'pedidos_pendientes' },
  { moduleSlug: 'mantenimiento', tabSlug: 'pedidos_confirmados' },
  { moduleSlug: 'mantenimiento', tabSlug: 'bandeja_aprobaciones' },
  { moduleSlug: 'mantenimiento', tabSlug: 'gestion_ordenes' },
  { moduleSlug: 'equipos', tabSlug: 'historial-mantenimiento-equipo' },
] as const;

/**
 * Sesión + empresa activa + `view` en alguna de las tabs que abren el historial.
 * Las funciones `'use cache'` no leen sesión: la empresa que devuelve esto entra como argumento
 * (y en la clave del cache), así un historial nunca se sirve a otra empresa.
 */
async function requireActivityLogAccess(): Promise<string> {
  await requireServerAuthProfile();
  const companyId = await getActiveCompanyId();

  const granted = await checkMultiplePermissionsServer(
    ACTIVITY_LOG_VIEW_TABS.map((tab) => ({ ...tab, actionSlug: 'view' }))
  );
  const allowed = [...granted.values()].some(Boolean);
  if (!allowed) throw new Error('No tenés permiso para ver el historial de mantenimiento');

  return companyId;
}

/**
 * Obtiene el historial de actividades de un pedido de mantenimiento.
 * Incluye información del usuario que realizó cada acción (como "performer").
 */
async function getMaintenanceOrderActivityLogCached(companyId: string, orderId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial de actividades', { data: { orderId } });

  try {
    const data = await prisma.maintenance_activity_log.findMany({
      where: { maintenance_order_id: orderId, company_id: companyId },
      select: ACTIVITY_LOG_SELECT,
      orderBy: { performed_at: 'asc' },
    });

    return data.map(mapActivityLogEntry);
  } catch (error) {
    serverLogger.error('Error al obtener historial de actividades', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Obtiene el historial de actividades de una solicitud de mantenimiento.
 */
async function getMaintenanceRequestActivityLogCached(companyId: string, requestId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_REQUESTS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial de actividades de solicitud', { data: { requestId } });

  try {
    const data = await prisma.maintenance_activity_log.findMany({
      where: { maintenance_request_id: requestId, company_id: companyId },
      select: ACTIVITY_LOG_SELECT,
      orderBy: { performed_at: 'asc' },
    });

    return data.map(mapActivityLogEntry);
  } catch (error) {
    serverLogger.error('Error al obtener historial de actividades de solicitud', { data: { error, requestId } });
    throw error;
  }
}

/**
 * Tipo del origen de una solicitud de mantenimiento
 */
export type MaintenanceRequestOrigin = {
  type: 'checklist' | 'manual';
  // Datos del checklist (si aplica)
  checklist?: {
    id: string;
    fecha: string | null;
    hora: string | null;
    chofer: string | null;
    kilometraje: string | null;
    createdAt: string | null;
    respondedBy: {
      id: string;
      fullname: string | null;
      email: string | null;
    } | null;
  };
  // Datos del creador manual (si aplica)
  manualCreator?: {
    id: string;
    fullname: string | null;
    email: string | null;
  } | null;
  createdAt: string | null;
  // Empleado conductor asociado a la solicitud (si aplica)
  driverEmployee?: {
    firstname: string;
    lastname: string;
    file: string | null;
  } | null;
};

/**
 * Obtiene el historial COMPLETO de una solicitud de mantenimiento, incluyendo:
 * - El origen (checklist o manual)
 * - El historial de actividades
 */
async function getMaintenanceRequestFullActivityLogCached(companyId: string, requestId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_REQUESTS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial completo de solicitud', { data: { requestId } });

  try {
    // 1. Obtener la solicitud, el activity log y los comentarios de los items en paralelo
    const [request, activityLogRaw, itemComments] = await Promise.all([
      prisma.maintenance_requests.findFirst({
        where: { id: requestId, company_id: companyId },
        select: {
          id: true,
          source: true,
          preventive_type: true,
          created_at: true,
          checklist_answer_id: true,
          user_id: true,
          checklist_answers: {
            select: {
              id: true,
              answer_data: true,
              created_at: true,
              profile: {
                select: { id: true, fullname: true, email: true },
              },
              employees: {
                select: { id: true, firstname: true, lastname: true },
              },
            },
          },
          profile_maintenance_requests_user_idToprofile: {
            select: { id: true, fullname: true, email: true },
          },
          driver_employee: {
            select: { id: true, firstname: true, lastname: true, file: true },
          },
        },
      }),
      prisma.maintenance_activity_log.findMany({
        where: { maintenance_request_id: requestId, company_id: companyId },
        select: ACTIVITY_LOG_SELECT,
        orderBy: { performed_at: 'asc' },
      }),
      getRequestItemComments(requestId),
    ]);

    if (!request) {
      serverLogger.error('Solicitud no encontrada', { data: { requestId } });
      throw new Error(`Solicitud ${requestId} no encontrada`);
    }

    const activityLog = activityLogRaw.map(mapActivityLogEntry);

    // 2. Construir información del origen
    let origin: MaintenanceRequestOrigin;

    if (request.source === 'manual' || !request.checklist_answer_id) {
      // Origen manual (sin checklist)
      const creator = request.profile_maintenance_requests_user_idToprofile;
      origin = {
        type: 'manual',
        manualCreator: creator ? { id: creator.id, fullname: creator.fullname, email: creator.email } : null,
        createdAt: request.created_at?.toISOString() ?? null,
        driverEmployee: request.driver_employee ?? null,
      };
    } else {
      // Origen desde checklist
      const answerData = request.checklist_answers?.answer_data as {
        fecha?: string;
        hora?: string;
        chofer?: string;
        kilometraje?: string;
      } | null;

      const checklistUser = request.checklist_answers?.profile;

      origin = {
        type: 'checklist',
        checklist: {
          id: request.checklist_answer_id,
          fecha: answerData?.fecha ?? null,
          hora: answerData?.hora ?? null,
          chofer: answerData?.chofer ?? null,
          kilometraje: answerData?.kilometraje ?? null,
          createdAt: request.checklist_answers?.created_at?.toISOString() ?? null,
          respondedBy: checklistUser
            ? { id: checklistUser.id, fullname: checklistUser.fullname, email: checklistUser.email }
            : null,
        },
        createdAt: request.created_at?.toISOString() ?? null,
        driverEmployee: request.driver_employee ?? null,
      };
    }

    return { origin, history: activityLog, itemComments };
  } catch (error) {
    serverLogger.error('Error al obtener historial completo de solicitud', { data: { error, requestId } });
    throw error;
  }
}

/**
 * Obtiene el historial COMPLETO de un pedido de mantenimiento (maintenance_order), incluyendo:
 * - El origen (checklist o manual) desde la solicitud asociada
 * - El historial de actividades de la solicitud
 * - El historial de actividades del pedido
 */
async function getMaintenanceOrderFullActivityLogCached(companyId: string, orderId: string, requestId?: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial completo de pedido', { data: { orderId, requestId } });

  try {
    // Resolver el requestId si no viene
    let maintenanceRequestId = requestId;
    if (!maintenanceRequestId) {
      const order = await prisma.maintenance_orders.findFirst({
        where: { id: orderId, company_id: companyId },
        select: { maintenance_request_id: true },
      });
      maintenanceRequestId = order?.maintenance_request_id ?? undefined;
    }

    // Resolver work_orders hijas de la OM con sus datos básicos
    const workOrdersData = await prisma.work_orders.findMany({
      where: {
        company_id: companyId,
        maintenance_order_items: {
          some: { maintenance_order_id: orderId },
        },
      },
      select: {
        id: true,
        order_number: true,
        status: true,
        planned_start_date: true,
        planned_end_date: true,
        sector_id: true,
        workshop_id: true,
        workshop_sectors: { select: { id: true, name: true } },
        workshops: { select: { id: true, name: true, type: true } },
      },
      orderBy: { sequence_number: 'asc' },
    });

    const workOrderIds = workOrdersData.map((wo) => wo.id);

    const [requestData, requestLogsRaw, orderLogsRaw, workOrderLogsRaw, itemComments] = await Promise.all([
      // 1. Origen desde la solicitud (si hay requestId)
      maintenanceRequestId
        ? prisma.maintenance_requests.findFirst({
            where: { id: maintenanceRequestId, company_id: companyId },
            select: {
              id: true,
              source: true,
              preventive_type: true,
              created_at: true,
              checklist_answer_id: true,
              user_id: true,
              checklist_answers: {
                select: {
                  id: true,
                  answer_data: true,
                  created_at: true,
                  profile: {
                    select: { id: true, fullname: true, email: true },
                  },
                  employees: {
                    select: { id: true, firstname: true, lastname: true },
                  },
                },
              },
              profile_maintenance_requests_user_idToprofile: {
                select: { id: true, fullname: true, email: true },
              },
              driver_employee: {
                select: { id: true, firstname: true, lastname: true, file: true },
              },
            },
          })
        : Promise.resolve(null),
      // 2. Logs de la solicitud (si hay requestId)
      maintenanceRequestId
        ? prisma.maintenance_activity_log.findMany({
            where: { maintenance_request_id: maintenanceRequestId, company_id: companyId },
            select: ACTIVITY_LOG_SELECT,
            orderBy: { performed_at: 'asc' },
          })
        : Promise.resolve([]),
      // 3. Logs del pedido (siempre)
      prisma.maintenance_activity_log.findMany({
        where: { maintenance_order_id: orderId, company_id: companyId },
        select: ACTIVITY_LOG_SELECT,
        orderBy: { performed_at: 'asc' },
      }),
      // 4. Logs de TODAS las work_orders hijas (si hay)
      workOrderIds.length > 0
        ? prisma.maintenance_activity_log.findMany({
            where: { work_order_id: { in: workOrderIds }, company_id: companyId },
            select: ACTIVITY_LOG_SELECT,
            orderBy: { performed_at: 'asc' },
          })
        : Promise.resolve([]),
      // 5. Comentarios cargados sobre los items del pedido (ticket 649)
      getRequestItemComments(maintenanceRequestId),
    ]);

    // 4. Construir información del origen
    let origin: MaintenanceRequestOrigin | null = null;

    if (requestData) {
      if (requestData.source === 'manual' || !requestData.checklist_answer_id) {
        const creator = requestData.profile_maintenance_requests_user_idToprofile;
        origin = {
          type: 'manual',
          manualCreator: creator ? { id: creator.id, fullname: creator.fullname, email: creator.email } : null,
          createdAt: requestData.created_at?.toISOString() ?? null,
          driverEmployee: requestData.driver_employee ?? null,
        };
      } else {
        const answerData = requestData.checklist_answers?.answer_data as {
          fecha?: string;
          hora?: string;
          chofer?: string;
          kilometraje?: string;
        } | null;

        const checklistUser = requestData.checklist_answers?.profile;

        origin = {
          type: 'checklist',
          checklist: {
            id: requestData.checklist_answer_id,
            fecha: answerData?.fecha ?? null,
            hora: answerData?.hora ?? null,
            chofer: answerData?.chofer ?? null,
            kilometraje: answerData?.kilometraje ?? null,
            createdAt: requestData.checklist_answers?.created_at?.toISOString() ?? null,
            respondedBy: checklistUser
              ? { id: checklistUser.id, fullname: checklistUser.fullname, email: checklistUser.email }
              : null,
          },
          createdAt: requestData.created_at?.toISOString() ?? null,
          driverEmployee: requestData.driver_employee ?? null,
        };
      }
    }

    // 6. OM history = request + order logs (deduped, sorted) — sin events de WO
    const requestLogs = requestLogsRaw.map(mapActivityLogEntry);
    const orderLogs = orderLogsRaw.map(mapActivityLogEntry);
    const workOrderLogs = workOrderLogsRaw.map(mapActivityLogEntry);

    const omLogsMap = new Map<string, (typeof requestLogs)[number]>();
    for (const log of requestLogs) omLogsMap.set(log.id, log);
    for (const log of orderLogs) {
      if (!omLogsMap.has(log.id)) omLogsMap.set(log.id, log);
    }
    const omHistory = Array.from(omLogsMap.values()).sort(
      (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
    );

    // 7. Group WO logs by work_order_id
    const woHistoryByWoId = new Map<string, (typeof workOrderLogs)[number][]>();
    for (const log of workOrderLogs) {
      if (!log.work_order_id) continue;
      const arr = woHistoryByWoId.get(log.work_order_id) ?? [];
      arr.push(log);
      woHistoryByWoId.set(log.work_order_id, arr);
    }

    // 8. Build workOrders array
    const workOrders = workOrdersData.map((wo) => ({
      id: wo.id,
      orderNumber: wo.order_number,
      status: wo.status,
      plannedStartDate: wo.planned_start_date,
      plannedEndDate: wo.planned_end_date,
      sectorName: wo.workshop_sectors?.name ?? null,
      workshopName: wo.workshops?.name ?? null,
      isExternal: wo.workshops?.type === 'externo',
      history: woHistoryByWoId.get(wo.id) ?? [],
    }));

    return { origin, history: omHistory, workOrders, itemComments };
  } catch (error) {
    serverLogger.error('Error al obtener historial completo de pedido', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Obtiene el historial de actividades de una orden de trabajo.
 */
async function getWorkOrderActivityLogCached(companyId: string, workOrderId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.WORK_ORDER_REPAIRS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial de actividades de orden de trabajo', { data: { workOrderId } });

  try {
    const data = await prisma.maintenance_activity_log.findMany({
      where: { work_order_id: workOrderId, company_id: companyId },
      select: ACTIVITY_LOG_SELECT,
      orderBy: { performed_at: 'asc' },
    });

    return data.map(mapActivityLogEntry);
  } catch (error) {
    serverLogger.error('Error al obtener historial de actividades de orden de trabajo', {
      data: { error, workOrderId },
    });
    throw error;
  }
}

/**
 * Obtiene el historial COMPLETO de una orden de trabajo, incluyendo:
 * - El historial de la solicitud/pedido original (maintenance_order)
 * - El historial específico de la orden de trabajo
 * - Información de otras OTs derivadas de la misma solicitud
 */
async function getWorkOrderFullActivityLogCached(companyId: string, workOrderId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.WORK_ORDER_REPAIRS);
  cacheLife({ revalidate: CACHE_TTL.PAGINATED_LIST });

  serverLogger.debug('Obteniendo historial completo de orden de trabajo', { data: { workOrderId } });

  try {
    // 1. Obtener la work_order con sus relaciones y el activity log de la WO en paralelo
    const [workOrder, workOrderLogsRaw] = await Promise.all([
      prisma.work_orders.findFirst({
        where: { id: workOrderId, company_id: companyId },
        select: {
          id: true,
          order_number: true,
          status: true,
          created_at: true,
          work_order_items: {
            select: {
              maintenance_order_item_id: true,
              maintenance_order_items: {
                select: {
                  maintenance_order_id: true,
                  maintenance_orders: {
                    select: {
                      id: true,
                      maintenance_request_id: true,
                      equipment_id: true,
                      vehicles: {
                        select: { domain: true, intern_number: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.maintenance_activity_log.findMany({
        where: { work_order_id: workOrderId, company_id: companyId },
        select: ACTIVITY_LOG_SELECT,
        orderBy: { performed_at: 'asc' },
      }),
    ]);

    if (!workOrder) {
      serverLogger.error('Orden de trabajo no encontrada', { data: { workOrderId } });
      throw new Error(`Orden de trabajo ${workOrderId} no encontrada`);
    }

    // Extraer IDs relevantes
    const maintenanceOrderId = workOrder.work_order_items[0]?.maintenance_order_items?.maintenance_order_id;
    const maintenanceRequestId =
      workOrder.work_order_items[0]?.maintenance_order_items?.maintenance_orders?.maintenance_request_id;

    // 2. Obtener logs del pedido, OTs hermanas y comentarios de los items en paralelo
    const [orderLogsRaw, siblingWorkOrdersRaw, itemComments] = await Promise.all([
      maintenanceOrderId
        ? prisma.maintenance_activity_log.findMany({
            where: { maintenance_order_id: maintenanceOrderId, company_id: companyId },
            select: ACTIVITY_LOG_SELECT,
            orderBy: { performed_at: 'asc' },
          })
        : Promise.resolve([]),
      maintenanceOrderId
        ? prisma.work_orders.findMany({
            where: {
              id: { not: workOrderId },
              company_id: companyId,
              work_order_items: {
                some: {
                  maintenance_order_items: {
                    maintenance_order_id: maintenanceOrderId,
                  },
                },
              },
            },
            select: { id: true, order_number: true, status: true },
          })
        : Promise.resolve([]),
      // Comentarios de los items del pedido del que cuelga esta OT (ticket 649)
      getRequestItemComments(maintenanceRequestId),
    ]);

    const orderLogs = orderLogsRaw.map(mapActivityLogEntry);
    const workOrderLogs = workOrderLogsRaw.map(mapActivityLogEntry);

    // 3. OTs hermanas — la query de Prisma ya filtra correctamente con `some`
    const siblingWorkOrders = siblingWorkOrdersRaw.map((wo) => ({
      id: wo.id,
      order_number: wo.order_number,
      status: wo.status as string,
    }));

    // 4. Combinar y marcar la fuente de cada registro
    const combinedHistory = [
      ...orderLogs.map((entry) => ({
        ...entry,
        source: 'order' as const,
        sourceLabel: 'Pedido de Mantenimiento',
      })),
      ...workOrderLogs.map((entry) => ({
        ...entry,
        source: 'work_order' as const,
        sourceLabel: `OT: ${workOrder.order_number}`,
      })),
    ].sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());

    return {
      history: combinedHistory,
      workOrder: {
        id: workOrder.id,
        orderNumber: workOrder.order_number,
        status: workOrder.status as string,
      },
      maintenanceOrderId,
      maintenanceRequestId,
      siblingWorkOrders,
      vehicleInfo: workOrder.work_order_items[0]?.maintenance_order_items?.maintenance_orders?.vehicles,
      itemComments,
    };
  } catch (error) {
    serverLogger.error('Error al obtener historial completo de orden de trabajo', { data: { error, workOrderId } });
    throw error;
  }
}

// ─── Entradas públicas (sesión + permiso + empresa; el cache solo recibe la empresa) ───

export async function getMaintenanceOrderActivityLog(orderId: string) {
  const companyId = await requireActivityLogAccess();
  return getMaintenanceOrderActivityLogCached(companyId, orderId);
}

export type MaintenanceActivityLogData = Awaited<ReturnType<typeof getMaintenanceOrderActivityLog>>;

export async function getMaintenanceRequestFullActivityLog(requestId: string) {
  const companyId = await requireActivityLogAccess();
  return getMaintenanceRequestFullActivityLogCached(companyId, requestId);
}

export async function getMaintenanceOrderFullActivityLog(orderId: string, requestId?: string) {
  const companyId = await requireActivityLogAccess();
  return getMaintenanceOrderFullActivityLogCached(companyId, orderId, requestId);
}

export async function getWorkOrderFullActivityLog(workOrderId: string) {
  const companyId = await requireActivityLogAccess();
  return getWorkOrderFullActivityLogCached(companyId, workOrderId);
}
