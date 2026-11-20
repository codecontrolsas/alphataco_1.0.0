import 'server-only';

import {
  getOrdersPendingValidation,
  getPendingApprovalTasks,
  getReturnedOrders,
  getReturnedTasks,
  type PendingTaskData,
  type ReturnedOrderData,
  type ReturnedTaskData,
  type ValidationOrdersData,
} from '@/features/Mantenimiento/ApprovalInbox/actions/actionsServer';
import {
  pendingApprovalWhere,
  pendingValidationWhere,
  resolvableReassignmentWhere,
} from '@/features/Mantenimiento/ApprovalInbox/lib/inbox-where';
import { REASSIGNABLE_ORDER_STATUSES } from '@/features/Mantenimiento/ApprovalInbox/lib/inbox-where';
import { getTaskInfo } from '@/features/Mantenimiento/ApprovalInbox/utils/task-info';
import { toResourceCellResource } from '@/features/Mantenimiento/shared/components/ResourceCell';
import type { WithMaintenanceResource } from '@/features/Mantenimiento/shared/maintenance-resource';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { cacheLife, cacheTag } from 'next/cache';
import { Logger } from '@/lib/logger';
import type { InboxAction, InboxCtx, InboxFetchOptions, InboxItem, InboxProvider, InboxSection } from '../lib/types';

const logger = new Logger('Inbox/maintenance');

const PROVIDER_ID = 'mantenimiento';
const MODULE_SLUG = 'mantenimiento';
const TALLER_HREF = '/dashboard/maintenance?tab=maint_operaciones&vista=taller';

const NOT_IN_WORKSHOP_REASON = 'El pedido ya no está en taller';

const VALIDATE_DISABLED_REASON =
  'Para validar el cierre necesitás permiso de edición en Órdenes de mantenimiento';

/** Qué ve y qué puede hacer el usuario, calculado una vez desde su mapa de permisos. */
function accessOf(permissions: Readonly<Record<string, boolean>>) {
  const approvalsView = permissions['mantenimiento:bandeja_aprobaciones:view'] === true;
  const ordersView = permissions['mantenimiento:ordenes_mantenimiento:view'] === true;
  return {
    /** Autorizar, reasignar y órdenes devueltas. */
    approvalsView,
    /** «Validar cierre» se ve con cualquiera de los dos permisos de lectura. */
    validationView: approvalsView || ordersView,
    approvalsUpdate: permissions['mantenimiento:bandeja_aprobaciones:update'] === true,
    ordersUpdate: permissions['mantenimiento:ordenes_mantenimiento:update'] === true,
  };
}

/** Equipo de un pedido: vehículo o equipamiento (ticket 596), con su tipo para dibujarlo bien. */
function toInboxResource(row: WithMaintenanceResource): NonNullable<InboxItem['resource']> {
  const { kind, identifier, internNumber } = toResourceCellResource(row);
  return { kind, identifier, internNumber: internNumber ?? null };
}

/** ISO de la fecha, o `undefined` si no hay: un `null` no se muestra como 1969. */
const iso = (value: Date | string | null | undefined): string | undefined => (value ? new Date(value).toISOString() : undefined);

// ----------------------------------------------------------------------------
// Contador (header y sidebar): solo decisiones, con los MISMOS `where` que las listas
// ----------------------------------------------------------------------------

/**
 * Cacheada con `'use cache'`: no puede leer la sesión, así que la empresa, los tipos ocultos y qué categorías ve el
 * usuario entran como argumentos (y en la clave del cache): un usuario nunca ve el número de otro con otros permisos.
 */
async function countDecisionsCached(
  companyId: string,
  hiddenTypeIds: readonly string[],
  scope: { tasks: boolean; validation: boolean }
): Promise<number> {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_APPROVALS, CACHE_TAGS.WORK_ORDER_REPAIRS, CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });

  return runInCompanyScope(companyId, async () => {
    const [authorizations, reassignments, validations] = await Promise.all([
      scope.tasks ? prisma.work_order_item_repairs.count({ where: pendingApprovalWhere(companyId, hiddenTypeIds) }) : 0,
      scope.tasks
        ? prisma.work_order_item_repairs.count({ where: resolvableReassignmentWhere(companyId, hiddenTypeIds) })
        : 0,
      scope.validation ? prisma.maintenance_orders.count({ where: pendingValidationWhere(companyId, hiddenTypeIds) }) : 0,
    ]);
    return authorizations + reassignments + validations;
  });
}

// ----------------------------------------------------------------------------
// Mapeo de las queries existentes a ítems de la bandeja
// ----------------------------------------------------------------------------

function authorizationItem(task: PendingTaskData, canDecide: boolean): InboxItem {
  const info = getTaskInfo(task);
  const user = task.added_by_user;
  const quote = task.technician_notes
    ? { label: 'Operario', text: task.technician_notes }
    : info.driverComment
      ? { label: 'Chofer', text: info.driverComment }
      : null;
  const actions: InboxAction[] = canDecide
    ? [
        { id: 'reject', enabled: true },
        { id: 'approve', enabled: true },
      ]
    : [];
  return {
    id: `${PROVIDER_ID}:task_authorization:${task.id}`,
    providerId: PROVIDER_ID,
    moduleSlug: MODULE_SLUG,
    type: 'task_authorization',
    kind: 'decision',
    title: info.repairTypeName,
    context: info.itemDescription ?? '',
    requestedBy: user?.fullname || user?.email || undefined,
    createdAt: iso(task.created_at),
    actions,
    href: `${TALLER_HREF}&taller_step=in_workshop`,
    entityId: task.id,
    resource: info.resource,
    reference: info.orderNumber ?? undefined,
    badge: info.sectorName ?? undefined,
    quote: quote ? { ...quote, tone: 'warn' } : undefined,
    workOrderId: info.workOrderId,
  };
}

function reassignmentItem(task: ReturnedTaskData, canDecide: boolean): InboxItem {
  const info = getTaskInfo(task);
  // El pedido ya no está en taller (se cerró o se rechazó con la tarea devuelta): no hay a dónde reasignarla. Se sigue
  // mostrando, con «Reasignar» deshabilitado y su motivo, y «Ver orden». No cuenta como decisión pendiente.
  const resolvable = info.orderStatus != null && (REASSIGNABLE_ORDER_STATUSES as readonly string[]).includes(info.orderStatus);
  const actions: InboxAction[] = [];
  if (canDecide) {
    actions.push(resolvable ? { id: 'reassign', enabled: true } : { id: 'reassign', enabled: false, disabledReason: NOT_IN_WORKSHOP_REASON });
  }
  if (!resolvable && info.orderId) actions.push({ id: 'open', enabled: true });
  return {
    id: `${PROVIDER_ID}:task_reassignment:${task.id}`,
    providerId: PROVIDER_ID,
    moduleSlug: MODULE_SLUG,
    type: 'task_reassignment',
    kind: 'decision',
    title: info.repairTypeName,
    context: info.itemDescription ?? '',
    createdAt: iso(task.updated_at ?? task.created_at),
    actions,
    href: `${TALLER_HREF}&taller_step=in_workshop`,
    entityId: task.id,
    orderId: info.orderId ?? undefined,
    resource: info.resource,
    reference: info.orderNumber ?? undefined,
    badge: task.original_sector?.name ?? undefined,
    quote: task.return_reason ? { label: 'Motivo de devolución', text: task.return_reason, tone: 'danger' } : undefined,
    workOrderId: info.workOrderId,
  };
}

function validationItem(order: ValidationOrdersData[number], canValidate: boolean): InboxItem {
  const resourceRow = { vehicles: order.vehicles, other_equipment: order.other_equipment };
  return {
    id: `${PROVIDER_ID}:order_validation:${order.id}`,
    providerId: PROVIDER_ID,
    moduleSlug: MODULE_SLUG,
    type: 'order_validation',
    kind: 'decision',
    title: order.order_number ?? 'Orden sin número',
    context: order.description ?? order.maintenance_requests?.description ?? '',
    createdAt: iso(order.updated_at),
    actions: [
      { id: 'open', enabled: true },
      canValidate
        ? { id: 'validate', enabled: true }
        : { id: 'validate', enabled: false, disabledReason: VALIDATE_DISABLED_REASON },
    ],
    href: `${TALLER_HREF}&taller_step=in_workshop`,
    entityId: order.id,
    orderId: order.id,
    resource: toInboxResource(resourceRow),
  };
}

function returnedOrderItem(order: ReturnedOrderData): InboxItem {
  const resourceRow = { vehicles: order.vehicles, other_equipment: order.other_equipment };
  return {
    id: `${PROVIDER_ID}:order_returned:${order.id}`,
    providerId: PROVIDER_ID,
    moduleSlug: MODULE_SLUG,
    type: 'order_returned',
    kind: 'info',
    title: order.order_number ?? 'Se asigna al ingresar',
    context: order.description ?? '',
    requestedBy: order.returnedBy ?? undefined,
    createdAt: iso(order.returnedAt),
    actions: [{ id: 'open', enabled: true }],
    href: `${TALLER_HREF}&taller_step=in_workshop`,
    entityId: order.id,
    orderId: order.id,
    resource: toInboxResource(resourceRow),
    badge: order.returnKind === 'items_rejected' ? 'Ítems rechazados' : 'Orden devuelta',
    quote: order.returnReason ? { label: 'Motivo', text: order.returnReason, tone: 'danger' } : undefined,
  };
}

const SECTION_META = {
  task_authorization: {
    label: 'Autorizaciones',
    description: 'Tareas que un operario agregó y requieren aprobación antes de ejecutarse.',
    kind: 'decision',
    emptyTitle: 'No hay tareas para autorizar.',
    emptyDescription: 'Aparecen cuando un operario agrega una tarea de un tipo de reparación que requiere autorización.',
  },
  task_reassignment: {
    label: 'Reasignaciones',
    description: 'Tareas que un sector devolvió porque no le corresponden: elegí el sector que las resuelve.',
    kind: 'decision',
    emptyTitle: 'No hay tareas devueltas para reasignar.',
    emptyDescription: 'Aparecen cuando un operario devuelve una tarea al jefe de taller.',
  },
  order_validation: {
    label: 'Validar cierre',
    description: 'Órdenes con todas sus OTs cerradas que esperan tu revisión.',
    kind: 'decision',
    emptyTitle: 'No hay órdenes pendientes de validación.',
    emptyDescription: 'Aparecen cuando todas las OTs de una orden quedan cerradas.',
  },
  order_returned: {
    label: 'Para tu información',
    description: 'Órdenes que devolviste al taller y siguen abiertas. Es solo un aviso: no suma al contador.',
    kind: 'info',
    emptyTitle: 'No hay órdenes devueltas al taller.',
    emptyDescription: 'Aparecen cuando devolvés una orden al taller o rechazás sus ítems, hasta que el taller la vuelve a cerrar.',
  },
} as const;

type SectionType = keyof typeof SECTION_META;

/** Una categoría aislada: si su consulta falla queda con `error` y las demás siguen. */
async function buildSection<T>(
  type: SectionType,
  load: () => Promise<T[]>,
  toItem: (row: T) => InboxItem,
  limit: number
): Promise<InboxSection> {
  const meta = SECTION_META[type];
  try {
    const rows = await load();
    return { type, ...meta, total: rows.length, items: rows.slice(0, limit).map(toItem) };
  } catch (error) {
    logger.error('Error al cargar una categoría de la bandeja', { data: { error, type } });
    return {
      type,
      ...meta,
      total: 0,
      items: [],
      error: error instanceof Error ? error.message : 'No se pudo cargar esta categoría',
    };
  }
}

export const maintenanceInboxProvider: InboxProvider = {
  id: PROVIDER_ID,
  moduleSlug: MODULE_SLUG,
  label: 'Mantenimiento',

  isEnabled(permissions) {
    return accessOf(permissions).validationView;
  },

  async countPending(ctx: InboxCtx) {
    const access = accessOf(ctx.permissions);
    if (!access.validationView) return 0;
    return countDecisionsCached(ctx.companyId, ctx.hiddenTypeIds, {
      tasks: access.approvalsView,
      validation: access.validationView,
    });
  },

  async fetchPending(ctx: InboxCtx, opts: InboxFetchOptions) {
    const access = accessOf(ctx.permissions);
    const wants = (type: SectionType) => !opts.type || opts.type === type;
    const sections: Array<Promise<InboxSection>> = [];

    if (access.approvalsView && wants('task_authorization')) {
      sections.push(
        buildSection('task_authorization', getPendingApprovalTasks, (t) => authorizationItem(t, access.approvalsUpdate), opts.limit)
      );
    }
    if (access.approvalsView && wants('task_reassignment')) {
      sections.push(
        buildSection('task_reassignment', getReturnedTasks, (t) => reassignmentItem(t, access.approvalsUpdate), opts.limit)
      );
    }
    if (access.validationView && wants('order_validation')) {
      sections.push(
        buildSection('order_validation', getOrdersPendingValidation, (o) => validationItem(o, access.ordersUpdate), opts.limit)
      );
    }
    if (access.approvalsView && wants('order_returned')) {
      sections.push(buildSection('order_returned', getReturnedOrders, returnedOrderItem, opts.limit));
    }

    return Promise.all(sections);
  },
};
