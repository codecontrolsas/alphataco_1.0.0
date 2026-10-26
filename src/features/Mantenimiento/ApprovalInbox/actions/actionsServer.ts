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
import { cacheLife, cacheTag } from 'next/cache';
import { assertSectorInCompany } from '../../OrderManagement/actions/perimeter';
import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';

const logger = new Logger('ApprovalInbox/actions');

const APPROVALS_MODULE = 'mantenimiento';
const APPROVALS_TAB = 'bandeja_aprobaciones';

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
    // Tipos de equipamiento ocultos para el usuario actual (ticket 690)
    const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
    const where: Record<string, unknown> = { status: 'pending_approval', company_id: companyId };
    if (equipmentCondition) {
      where.work_order_items = { maintenance_order_items: { maintenance_orders: equipmentCondition } };
    }

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
                    equipment_id: true,
                    vehicles: {
                      select: { id: true, domain: true, serie: true, intern_number: true },
                    },
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
    // Tipos de equipamiento ocultos para el usuario actual (ticket 690)
    const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
    const where: Record<string, unknown> = { status: 'reassignment_requested', company_id: companyId };
    if (equipmentCondition) {
      where.work_order_items = { maintenance_order_items: { maintenance_orders: equipmentCondition } };
    }

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
                    equipment_id: true,
                    vehicles: {
                      select: { id: true, domain: true, serie: true, intern_number: true },
                    },
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
    // Tipos de equipamiento ocultos para el usuario actual (ticket 690). Va dentro
    // de AND (nunca spreadeado en la raíz): es un OR y podría chocar con otro futuro.
    const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
    const where: Record<string, unknown> = {
      status: 'pending_workshop_validation',
      company_id: companyId,
      ...(equipmentCondition ? { AND: [equipmentCondition] } : {}),
    };

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
  // Las funciones cacheadas no leen sesión: la empresa entra como argumento (y en la clave del cache).
  const companyId = await requireApprovalsAccess('view');
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
 * Reasigna una tarea devuelta a un nuevo sector
 */
export async function reassignTaskToSector(taskId: string, newSectorId: string) {
  const companyId = await requireApprovalsAccess('update');
  const profile = await requireServerAuthProfile();

  logger.debug('Reasignando tarea a nuevo sector', { data: { taskId, newSectorId } });

  try {
    // El sector llega del cliente: tiene que ser de la empresa activa.
    await assertSectorInCompany(newSectorId, companyId);

    const repair = await prisma.work_order_item_repairs.findFirst({
      where: { id: taskId, company_id: companyId },
      select: {
        work_order_items: {
          select: { maintenance_order_item_id: true },
        },
      },
    });

    if (!repair) {
      throw new Error('Tarea no encontrada');
    }

    const ctx = await resolveRepairContext(taskId, companyId);
    const newSector = await prisma.workshop_sectors.findFirst({
      where: { id: newSectorId, company_id: companyId },
      select: { name: true },
    });

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.work_order_item_repairs.updateMany({
        where: { id: taskId, company_id: companyId, status: 'reassignment_requested' },
        data: { status: 'pending' },
      });
      if (count === 0) throw new Error('La tarea ya no está pendiente de reasignación');

      const moItemId = repair.work_order_items?.maintenance_order_item_id;
      if (moItemId) {
        await tx.maintenance_order_items.updateMany({
          where: { id: moItemId, company_id: companyId },
          data: { assigned_sector_id: newSectorId },
        });
      }

      if (ctx.workOrderId) {
        await logActivity(tx, {
          workOrderId: ctx.workOrderId,
          actionType: ACTIVITY_LOG.REPAIR_TASK_REASSIGNED,
          performedBy: profile.id,
          previousStatus: 'reassignment_requested',
          newStatus: 'pending',
          metadata: {
            repairId: taskId,
            repairTypeName: ctx.repairTypeName,
            fromSector: ctx.currentSectorName,
            toSector: newSector?.name ?? null,
          },
        });
      }
    });
  } catch (error) {
    logger.error('Error al reasignar tarea', { data: { error, taskId, newSectorId } });
    throw new Error(`Error al reasignar: ${error instanceof Error ? error.message : String(error)}`);
  }

  await invalidateCacheTags(INVALIDATION_MAP.reassignTaskToSector);

  logger.info('Tarea reasignada a nuevo sector', { data: { taskId, newSectorId } });
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
