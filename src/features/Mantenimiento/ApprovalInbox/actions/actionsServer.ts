'use server';

import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { cacheLife, cacheTag, revalidatePath } from 'next/cache';
import { findOrCreateOpenSectorWorkOrder } from '../../OrderManagement/lib/sector-work-order.server';
import { withMaintenanceActor } from '../../shared/maintenance-actor';
import { lockMaintenanceOrder } from '../../shared/order-lock';
import { requireMaintenancePermission } from '../../shared/permissions.server';
import { assertSectorInCompany } from '../../OrderManagement/actions/perimeter';
import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import {
  REASSIGNABLE_ORDER_STATUSES,
  pendingApprovalWhere,
  pendingValidationWhere,
  reassignmentRequestedWhere,
} from '../lib/inbox-where';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';

const logger = new Logger('ApprovalInbox/actions');

const APPROVALS_MODULE = 'mantenimiento';
const APPROVALS_TAB = 'bandeja_aprobaciones';

/** Tabs cuyo `view` habilita la categoría «Validar cierre». */
const VALIDATION_VIEW_TABS = [APPROVALS_TAB, 'ordenes_mantenimiento'] as const;

/** Exige el permiso de la Bandeja de Aprobaciones y devuelve la empresa activa. */
async function requireApprovalsAccess(action: 'view' | 'update'): Promise<string> {
  const [companyId, allowed] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer(APPROVALS_MODULE, APPROVALS_TAB, action),
  ]);
  if (!allowed) throw new Error('No tenés permiso para esta acción en la Bandeja de Aprobaciones');
  return companyId;
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Obtiene tareas pendientes de aprobacion (status: pending_approval)
 * Estas son tareas agregadas por operarios con tipos de reparacion autorizables
 *
 * Cacheada con `'use cache'`: NO puede leer cookies/sesión, por eso recibe
 * `hiddenTypeIds` ya resuelto (ticket 690) — entra en la key del cache, así un
 * usuario nunca ve el cache de otro con distintos tipos ocultos.
 */
async function getPendingApprovalTasksCached(companyId: string, hiddenTypeIds: readonly string[]) {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_APPROVALS, CACHE_TAGS.WORK_ORDER_REPAIRS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });
  return runInCompanyScope(companyId, () => getPendingApprovalTasksCachedQuery(companyId, hiddenTypeIds));
}

/** Cuerpo de `getPendingApprovalTasksCached`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getPendingApprovalTasksCachedQuery(companyId: string, hiddenTypeIds: readonly string[]) {
  logger.debug('Obteniendo tareas pendientes de aprobacion');

  try {
    // Mismo `where` que el contador de Mi bandeja (incluye los tipos de equipamiento ocultos, ticket 690)
    const where = pendingApprovalWhere(companyId, hiddenTypeIds);

    const data = await prisma.work_order_item_repairs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        work_order_item_id: true,
        repair_type_id: true,
        status: true,
        technician_notes: true,
        completed_at: true,
        completed_by: true,
        created_at: true,
        updated_at: true,
        added_by: true,
        approved_by: true,
        approved_at: true,
        rejection_reason: true,
        original_sector_id: true,
        is_operator_added: true,
        return_reason: true,
        is_diagnostico: true,
        technician_notes_by: true,
        types_of_repairs: {
          select: { id: true, name: true, autorizable: true },
        },
        profile_work_order_item_repairs_added_byToprofile: {
          select: { id: true, email: true, fullname: true },
        },
        work_order_items: {
          select: {
            id: true,
            work_order_id: true,
            maintenance_order_items: {
              select: {
                id: true,
                maintenance_order_id: true,
                assigned_sector_id: true,
                description: true,
                workshop_sectors: {
                  select: { id: true, name: true },
                },
                maintenance_request_items: {
                  select: { driver_comment: true, description: true },
                },
                maintenance_orders: {
                  select: {
                    id: true,
                    order_number: true,
                    status: true,
                    equipment_id: true,
                    vehicles: {
                      select: { id: true, domain: true, serie: true, intern_number: true },
                    },
                    other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Mapear para mantener compatibilidad de nombres con la query de Supabase original
    return data.map((item) => ({
      ...item,
      added_by_user: item.profile_work_order_item_repairs_added_byToprofile,
    }));
  } catch (error) {
    logger.error('Error al obtener tareas pendientes de aprobacion', { data: { error } });
    throw error;
  }
}

export async function getPendingApprovalTasks() {
  // Las funciones cacheadas no leen sesión: la empresa entra como argumento (y en la clave del cache).
  const companyId = await requireApprovalsAccess('view');
  const hiddenTypeIds = await getHiddenEquipmentTypeIds();
  return getPendingApprovalTasksCached(companyId, hiddenTypeIds);
}

export type PendingTasksData = Awaited<ReturnType<typeof getPendingApprovalTasks>>;
export type PendingTaskData = PendingTasksData[number];

/**
 * Obtiene tareas devueltas por reasignacion (status: reassignment_requested)
 *
 * Cacheada con `'use cache'`: recibe `hiddenTypeIds` ya resuelto (ticket 690),
 * igual que `getPendingApprovalTasksCached`.
 */
async function getReturnedTasksCached(companyId: string, hiddenTypeIds: readonly string[]) {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_APPROVALS, CACHE_TAGS.WORK_ORDER_REPAIRS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });
  return runInCompanyScope(companyId, () => getReturnedTasksCachedQuery(companyId, hiddenTypeIds));
}

/** Cuerpo de `getReturnedTasksCached`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getReturnedTasksCachedQuery(companyId: string, hiddenTypeIds: readonly string[]) {
  logger.debug('Obteniendo tareas devueltas por reasignacion');

  try {
    // Mismo `where` que el contador de Mi bandeja (incluye los tipos de equipamiento ocultos, ticket 690)
    const where = reassignmentRequestedWhere(companyId, hiddenTypeIds);

    const data = await prisma.work_order_item_repairs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        work_order_item_id: true,
        repair_type_id: true,
        status: true,
        technician_notes: true,
        completed_at: true,
        completed_by: true,
        created_at: true,
        updated_at: true,
        added_by: true,
        approved_by: true,
        approved_at: true,
        rejection_reason: true,
        original_sector_id: true,
        is_operator_added: true,
        return_reason: true,
        is_diagnostico: true,
        technician_notes_by: true,
        types_of_repairs: {
          select: { id: true, name: true },
        },
        // original_sector_id → workshop_sectors (FK en work_order_item_repairs)
        workshop_sectors: {
          select: { id: true, name: true },
        },
        work_order_items: {
          select: {
            id: true,
            work_order_id: true,
            maintenance_order_items: {
              select: {
                id: true,
                maintenance_order_id: true,
                assigned_sector_id: true,
                description: true,
                workshop_sectors: {
                  select: { id: true, name: true },
                },
                maintenance_request_items: {
                  select: { driver_comment: true, description: true },
                },
                maintenance_orders: {
                  select: {
                    id: true,
                    order_number: true,
                    status: true,
                    equipment_id: true,
                    vehicles: {
                      select: { id: true, domain: true, serie: true, intern_number: true },
                    },
                    other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Mapear para mantener compatibilidad de nombres con la query de Supabase original
    return data.map((item) => ({
      ...item,
      original_sector: item.workshop_sectors,
    }));
  } catch (error) {
    logger.error('Error al obtener tareas devueltas', { data: { error } });
    throw error;
  }
}

export async function getReturnedTasks() {
  // Las funciones cacheadas no leen sesión: la empresa entra como argumento (y en la clave del cache).
  const companyId = await requireApprovalsAccess('view');
  const hiddenTypeIds = await getHiddenEquipmentTypeIds();
  return getReturnedTasksCached(companyId, hiddenTypeIds);
}

export type ReturnedTasksData = Awaited<ReturnType<typeof getReturnedTasks>>;
export type ReturnedTaskData = ReturnedTasksData[number];

/**
 * Obtiene ordenes de mantenimiento pendientes de validacion del jefe de taller.
 * Estas son ordenes donde todas las OTs fueron completadas y necesitan revision.
 *
 * Cacheada con `'use cache'`: recibe `hiddenTypeIds` ya resuelto (ticket 690),
 * igual que `getPendingApprovalTasksCached`.
 */
async function getOrdersPendingValidationCached(companyId: string, hiddenTypeIds: readonly string[]) {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_APPROVALS, CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });
  return runInCompanyScope(companyId, () => getOrdersPendingValidationCachedQuery(companyId, hiddenTypeIds));
}

/** Cuerpo de `getOrdersPendingValidationCached`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getOrdersPendingValidationCachedQuery(companyId: string, hiddenTypeIds: readonly string[]) {
  logger.debug('Obteniendo ordenes pendientes de validacion');

  try {
    // Mismo `where` que el contador de Mi bandeja (incluye los tipos de equipamiento ocultos, ticket 690)
    const where = pendingValidationWhere(companyId, hiddenTypeIds);

    const orders = await prisma.maintenance_orders.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        order_number: true,
        status: true,
        description: true,
        workshop_entry_date: true,
        updated_at: true,
        equipment_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            intern_number: true,
            serie: true,
          },
        },
        // Ticket 596: la orden puede ser de un equipamiento en vez de un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            description: true,
          },
        },
        maintenance_order_items: {
          select: {
            id: true,
            is_diagnostico: true,
            assigned_sector_id: true,
            workshop_sectors: { select: { id: true, name: true } },
            work_orders: {
              select: {
                id: true,
                order_number: true,
                status: true,
                work_order_items: {
                  select: {
                    id: true,
                    work_order_item_repairs: {
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return orders;
  } catch (error) {
    logger.error('Error al obtener ordenes pendientes de validacion', { data: { error } });
    throw error;
  }
}

export async function getOrdersPendingValidation() {
  // «Validar cierre» se ve con `bandeja_aprobaciones:view` O con `ordenes_mantenimiento:view`: quien ya ve las órdenes
  // del taller no pierde acceso a las que esperan su cierre. Validar sigue exigiendo `ordenes_mantenimiento:update`.
  await requireMaintenancePermission(VALIDATION_VIEW_TABS, 'view');
  // Las funciones cacheadas no leen sesión: la empresa entra como argumento (y en la clave del cache).
  const companyId = await getActiveCompanyId();
  const hiddenTypeIds = await getHiddenEquipmentTypeIds();
  return getOrdersPendingValidationCached(companyId, hiddenTypeIds);
}

export type ValidationOrdersData = Awaited<ReturnType<typeof getOrdersPendingValidation>>;

/**
 * Tipos de log que devuelven una orden al taller (D-1): el jefe de taller la devolvió entera o rechazó
 * ítems puntuales. Ambos dejan la orden en `in_workshop`.
 */
const RETURN_LOG_ACTIONS = [ACTIVITY_LOG.WORKSHOP_RETURNED_ORDER, ACTIVITY_LOG.WORKSHOP_ITEM_REJECTED] as const;

/** Tope defensivo de filas: es una lista informativa, no una tabla paginada. */
const RETURNED_ORDERS_LIMIT = 200;

/**
 * Órdenes devueltas al taller (D-1). Informativa: no suma al contador del paso Aprobaciones.
 *
 * Una orden `in_workshop` cuenta como devuelta si el ÚLTIMO log que cambió su estado es uno de
 * `RETURN_LOG_ACTIONS`. Así el ciclo devuelta → reenviada → abierta otra vez no la deja colgada:
 * cualquier cambio de estado posterior (ingreso, validación) la saca de la lista.
 * Sin `'use cache'`: tiene que reflejar la bandeja tras cada acción.
 */
export async function getReturnedOrders() {
  const companyId = await requireApprovalsAccess('view');
  const hiddenTypeIds = await getHiddenEquipmentTypeIds();
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);

  logger.debug('Obteniendo ordenes devueltas al taller');

  try {
    const orders = await prisma.maintenance_orders.findMany({
      where: {
        status: 'in_workshop',
        company_id: companyId,
        maintenance_activity_log: { some: { action_type: { in: [...RETURN_LOG_ACTIONS] } } },
        ...(equipmentCondition ? { AND: [equipmentCondition] } : {}),
      },
      orderBy: { updated_at: 'desc' },
      select: {
        id: true,
        order_number: true,
        description: true,
        rejection_reason: true,
        vehicles: { select: { id: true, domain: true, intern_number: true, serie: true } },
        other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
        // Último log que cambió el estado de la orden (para saber si la última transición fue la devolución).
        maintenance_activity_log: {
          where: { new_status: { not: null } },
          orderBy: { performed_at: 'desc' },
          take: 1,
          select: {
            action_type: true,
            performed_at: true,
            rejection_reason: true,
            notes: true,
            profile: { select: { id: true, fullname: true } },
          },
        },
      },
    });

    const returned = orders.flatMap((order) => {
      const lastLog = order.maintenance_activity_log[0];
      if (!lastLog || !(RETURN_LOG_ACTIONS as readonly string[]).includes(lastLog.action_type)) return [];
      const { maintenance_activity_log: _logs, ...rest } = order;
      return [
        {
          ...rest,
          returnedAt: lastLog.performed_at,
          returnedBy: lastLog.profile?.fullname ?? null,
          returnKind:
            lastLog.action_type === ACTIVITY_LOG.WORKSHOP_ITEM_REJECTED
              ? ('items_rejected' as const)
              : ('order' as const),
          returnReason: lastLog.rejection_reason ?? lastLog.notes ?? order.rejection_reason ?? null,
        },
      ];
    });
    return returned.slice(0, RETURNED_ORDERS_LIMIT);
  } catch (error) {
    logger.error('Error al obtener ordenes devueltas al taller', { data: { error } });
    throw error;
  }
}

export type ReturnedOrdersData = Awaited<ReturnType<typeof getReturnedOrders>>;
export type ReturnedOrderData = ReturnedOrdersData[number];

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Aprueba una tarea pendiente de autorizacion
 */
export async function approveTask(taskId: string) {
  const companyId = await requireApprovalsAccess('update');
  const profile = await requireServerAuthProfile();

  logger.debug('Aprobando tarea', { data: { taskId, approvedBy: profile.id } });

  try {
    const ctx = await resolveRepairContext(taskId, companyId);

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.work_order_item_repairs.updateMany({
        where: { id: taskId, company_id: companyId, status: 'pending_approval' },
        data: {
          status: 'pending',
          approved_by: profile.id,
          approved_at: new Date(),
        },
      });
      if (count === 0) throw new Error('La tarea ya no está pendiente de aprobación');

      if (ctx.workOrderId) {
        await logActivity(tx, {
          workOrderId: ctx.workOrderId,
          actionType: ACTIVITY_LOG.REPAIR_TASK_APPROVED,
          performedBy: profile.id,
          previousStatus: 'pending_approval',
          newStatus: 'pending',
          metadata: {
            repairId: taskId,
            repairTypeName: ctx.repairTypeName,
            sectorName: ctx.currentSectorName,
          },
        });
      }
    });
  } catch (error) {
    logger.error('Error al aprobar tarea', { data: { error, taskId } });
    throw new Error(`Error al aprobar tarea: ${error instanceof Error ? error.message : String(error)}`);
  }

  await invalidateCacheTags(INVALIDATION_MAP.approveTask);

  logger.info('Tarea aprobada', { data: { taskId } });
}

/**
 * Rechaza una tarea pendiente de autorizacion
 */
export async function rejectTask(taskId: string, reason: string) {
  const companyId = await requireApprovalsAccess('update');
  const profile = await requireServerAuthProfile();

  logger.debug('Rechazando tarea', { data: { taskId, rejectedBy: profile.id } });

  try {
    const ctx = await resolveRepairContext(taskId, companyId);

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.work_order_item_repairs.updateMany({
        where: { id: taskId, company_id: companyId, status: 'pending_approval' },
        data: {
          status: 'rejected',
          rejection_reason: reason,
          approved_by: profile.id,
          approved_at: new Date(),
        },
      });
      if (count === 0) throw new Error('La tarea ya no está pendiente de aprobación');

      if (ctx.workOrderId) {
        await logActivity(tx, {
          workOrderId: ctx.workOrderId,
          actionType: ACTIVITY_LOG.REPAIR_TASK_REJECTED,
          performedBy: profile.id,
          previousStatus: 'pending_approval',
          newStatus: 'rejected',
          rejectionReason: reason,
          metadata: {
            repairId: taskId,
            repairTypeName: ctx.repairTypeName,
            sectorName: ctx.currentSectorName,
            reason,
          },
        });
      }
    });
  } catch (error) {
    logger.error('Error al rechazar tarea', { data: { error, taskId } });
    throw new Error(`Error al rechazar tarea: ${error instanceof Error ? error.message : String(error)}`);
  }

  await invalidateCacheTags(INVALIDATION_MAP.rejectTask);

  logger.info('Tarea rechazada', { data: { taskId, reason } });
}

/**
 * Reasigna una tarea devuelta a otro sector: la tarea pasa a la OT del sector destino (la abierta del mismo pedido o
 * una nueva `pending`), así el operario del destino la ve y el origen deja de tenerla pendiente.
 *
 * - Ítem de OT con UNA tarea (caso A): el ítem entero se mueve a la OT destino.
 * - Ítem con varias tareas (caso B): se crea un ítem nuevo en el destino y se mueve solo esa tarea (conserva id e
 *   historial); las demás siguen en el sector de origen.
 * Todo en una transacción con el pedido bloqueado. La OT de origen no se cierra sola: el cierre es siempre humano.
 */
export async function reassignTaskToSector(taskId: string, newSectorId: string) {
  const companyId = await requireApprovalsAccess('update');
  const profile = await requireServerAuthProfile();

  logger.debug('Reasignando tarea a nuevo sector', { data: { taskId, newSectorId } });

  try {
    // El sector llega del cliente: tiene que ser de la empresa activa.
    await assertSectorInCompany(newSectorId, companyId);

    // Lectura previa SOLO para ubicar el pedido que hay que bloquear; todo lo que decide el movimiento se relee adentro.
    const located = await prisma.work_order_item_repairs.findFirst({
      where: { id: taskId, company_id: companyId },
      select: { work_order_items: { select: { maintenance_order_items: { select: { maintenance_order_id: true } } } } },
    });
    const maintenanceOrderId = located?.work_order_items?.maintenance_order_items?.maintenance_order_id;
    if (!maintenanceOrderId) throw new Error('Tarea no encontrada');

    const newSector = await prisma.workshop_sectors.findFirst({
      where: { id: newSectorId, company_id: companyId },
      select: { name: true, workshop_id: true },
    });
    if (!newSector) throw new Error('El sector de destino no existe');

    const result = await withMaintenanceActor(profile.id, async (tx) => {
      // 2. El pedido se bloquea primero (orden de locks pedido → OT) y tiene que seguir en taller.
      await lockMaintenanceOrder(tx, maintenanceOrderId);
      const order = await tx.maintenance_orders.findUnique({
        where: { id: maintenanceOrderId },
        select: { status: true },
      });
      if (!order || !(REASSIGNABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new Error('El pedido ya no está en taller');
      }

      // Con el pedido bloqueado se relee todo lo que decide entre el caso A y el B: otra reasignación o una edición
      // del ítem pueden haber cambiado la cantidad de tareas o la OT donde vive entre la lectura previa y el lock.
      const repair = await tx.work_order_item_repairs.findFirst({
        where: { id: taskId, company_id: companyId },
        select: {
          id: true,
          repair_type_id: true,
          original_sector_id: true,
          types_of_repairs: { select: { name: true } },
          work_order_items: {
            select: {
              id: true,
              work_orders: {
                select: { id: true, sector_id: true, planned_start_date: true, planned_end_date: true },
              },
              maintenance_order_items: {
                select: {
                  id: true,
                  maintenance_order_id: true,
                  description: true,
                  is_critical: true,
                  planned_start_date: true,
                  planned_end_date: true,
                  workshop_sectors: { select: { name: true } },
                },
              },
              _count: { select: { work_order_item_repairs: true } },
            },
          },
        },
      });
      const woItem = repair?.work_order_items;
      const moItem = woItem?.maintenance_order_items;
      const originWo = woItem?.work_orders;
      if (!repair || !woItem || !moItem || !originWo) throw new Error('Tarea no encontrada');
      if (moItem.maintenance_order_id !== maintenanceOrderId) {
        throw new Error('La tarea cambió de pedido: actualizá la pantalla e intentá de nuevo');
      }

      const originSectorName =
        (originWo.sector_id
          ? (await tx.workshop_sectors.findFirst({ where: { id: originWo.sector_id }, select: { name: true } }))?.name
          : null) ??
        moItem.workshop_sectors?.name ??
        null;

      // 3. Guarda de estado: dos jefes reasignando a la vez no la mueven dos veces.
      const { count } = await tx.work_order_item_repairs.updateMany({
        where: { id: taskId, company_id: companyId, status: 'reassignment_requested' },
        data: { status: 'pending' },
      });
      if (count === 0) throw new Error('La tarea ya no está pendiente de reasignación');
      if (!repair.original_sector_id && originWo.sector_id) {
        await tx.work_order_item_repairs.updateMany({
          where: { id: taskId, original_sector_id: null },
          data: { original_sector_id: originWo.sector_id },
        });
      }

      const activity = {
        actionType: ACTIVITY_LOG.REPAIR_TASK_REASSIGNED,
        performedBy: profile.id,
        previousStatus: 'reassignment_requested',
        newStatus: 'pending',
        maintenanceOrderId,
      } as const;

      // 4. Mismo sector que su OT: solo vuelve a pendiente.
      if (originWo.sector_id === newSectorId) {
        await logActivity(tx, {
          ...activity,
          workOrderId: originWo.id,
          metadata: {
            repairId: taskId,
            repairTypeName: repair.types_of_repairs?.name ?? null,
            fromSector: originSectorName,
            toSector: newSector.name,
            fromWorkOrderId: originWo.id,
            toWorkOrderId: originWo.id,
          },
        });
        return { moved: false as const, cancelledOriginWorkOrder: false };
      }

      // 5. OT destino: la abierta del mismo pedido para ese sector, o una nueva `pending`.
      const { workOrder: destWo } = await findOrCreateOpenSectorWorkOrder(tx, {
        maintenanceOrderId,
        sectorId: newSectorId,
        companyId,
        profileId: profile.id,
        plannedDates: {
          plannedStartDate: originWo.planned_start_date,
          plannedEndDate: originWo.planned_end_date,
        },
      });

      // 6. Mover el ítem (A) o desdoblarlo (B), según lo que hay AHORA en la base.
      const onlyTask = woItem._count.work_order_item_repairs <= 1;
      if (onlyTask) {
        await tx.work_order_items.update({ where: { id: woItem.id }, data: { work_order_id: destWo.id } });
        await tx.maintenance_order_items.update({
          where: { id: moItem.id },
          data: {
            work_order_id: destWo.id,
            assigned_sector_id: newSectorId,
            assigned_workshop_id: newSector.workshop_id,
          },
        });
      } else {
        const newMoItem = await tx.maintenance_order_items.create({
          data: {
            maintenance_order_id: maintenanceOrderId,
            company_id: companyId,
            repair_type_id: repair.repair_type_id,
            description: moItem.description,
            is_critical: moItem.is_critical,
            is_diagnostico: false,
            assigned_sector_id: newSectorId,
            assigned_workshop_id: newSector.workshop_id,
            assigned_at: new Date(),
            assigned_by: profile.id,
            planned_start_date: moItem.planned_start_date,
            planned_end_date: moItem.planned_end_date,
            work_order_id: destWo.id,
          },
          select: { id: true },
        });
        const newWoItem = await tx.work_order_items.create({
          data: { work_order_id: destWo.id, maintenance_order_item_id: newMoItem.id, status: 'pending' },
          select: { id: true },
        });
        await tx.work_order_item_repairs.update({
          where: { id: taskId },
          data: { work_order_item_id: newWoItem.id },
        });
        // El tipo de reparación viaja con la tarea: si el ítem de origen lo listaba, pasa al ítem nuevo.
        const pivot = await tx.maintenance_order_item_repair_types.findFirst({
          where: { maintenance_order_item_id: moItem.id, repair_type_id: repair.repair_type_id },
          select: { id: true },
        });
        if (pivot) {
          await tx.maintenance_order_item_repair_types.update({
            where: { id: pivot.id },
            data: { maintenance_order_item_id: newMoItem.id },
          });
        }
      }

      // 7. Historial en origen y destino.
      const metadata = {
        repairId: taskId,
        repairTypeName: repair.types_of_repairs?.name ?? null,
        fromSector: originSectorName,
        toSector: newSector.name,
        fromWorkOrderId: originWo.id,
        toWorkOrderId: destWo.id,
        splitItem: !onlyTask,
      };
      await logActivity(tx, { ...activity, workOrderId: originWo.id, metadata });
      await logActivity(tx, { ...activity, workOrderId: destWo.id, metadata });

      // 8. Caso A: la OT de origen se cancela SOLO si se cumplen las tres condiciones: quedó sin ningún ítem, no tiene
      // pedidos de materiales asociados y nunca se inició (`pending`). Así no queda una OT huérfana, vacía y abierta, en
      // el panel del operario de ese sector. En cualquier otro caso queda abierta, como siempre, y la cierra el operario.
      // Una cancelada sin ítems no cuenta para el cierre del pedido ni para el «una OT en progreso a la vez».
      let cancelledOriginWorkOrder = false;
      if (onlyTask) {
        const [remainingItems, materialRequests] = await Promise.all([
          tx.work_order_items.count({ where: { work_order_id: originWo.id } }),
          tx.material_requests.count({ where: { work_order_id: originWo.id } }),
        ]);
        if (remainingItems === 0 && materialRequests === 0) {
          const reason = `Sin tareas tras reasignar a ${newSector.name}`;
          const cancelled = await tx.work_orders.updateMany({
            where: { id: originWo.id, company_id: companyId, status: 'pending' },
            data: {
              status: 'cancelled',
              cancelled_at: new Date(),
              cancelled_by: profile.id,
              cancellation_reason: reason,
            },
          });
          if (cancelled.count === 1) {
            cancelledOriginWorkOrder = true;
            // Igual que el resto de las transiciones de OT (panel del operario): el trigger de la base y `logActivity`.
            await logActivity(tx, {
              workOrderId: originWo.id,
              maintenanceOrderId,
              actionType: ACTIVITY_LOG.WORK_ORDER_CANCELLED,
              performedBy: profile.id,
              previousStatus: 'pending',
              newStatus: 'cancelled',
              notes: reason,
              metadata: { reason, toWorkOrderId: destWo.id, repairId: taskId },
            });
          }
        }
      }

      return { moved: true as const, cancelledOriginWorkOrder };
    });

    logger.info('Tarea reasignada a nuevo sector', { data: { taskId, newSectorId, ...result } });
  } catch (error) {
    logger.error('Error al reasignar tarea', { data: { error, taskId, newSectorId } });
    throw new Error(`Error al reasignar: ${error instanceof Error ? error.message : String(error)}`);
  }

  await invalidateCacheTags(INVALIDATION_MAP.reassignTaskToSector);
  revalidatePath('/operator');
}

/** Sectores activos para elegir el destino de una reasignación (alcanza con ver la bandeja de aprobaciones). */
export async function getApprovalSectors() {
  const companyId = await requireApprovalsAccess('view');
  return prisma.workshop_sectors.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Resuelve el work_order_id, repair_type_name y sector_name desde un repair.
 * Usado para enriquecer metadata de los logs de ApprovalInbox.
 */
async function resolveRepairContext(repairId: string, companyId: string) {
  const repair = await prisma.work_order_item_repairs.findFirst({
    where: { id: repairId, company_id: companyId },
    select: {
      types_of_repairs: { select: { name: true } },
      workshop_sectors: { select: { name: true } },
      work_order_items: {
        select: {
          work_order_id: true,
          maintenance_order_items: {
            select: {
              workshop_sectors: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return {
    workOrderId: repair?.work_order_items?.work_order_id ?? null,
    repairTypeName: repair?.types_of_repairs?.name ?? null,
    originalSectorName: repair?.workshop_sectors?.name ?? null,
    currentSectorName: repair?.work_order_items?.maintenance_order_items?.workshop_sectors?.name ?? null,
  };
}
