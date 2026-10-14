import type {
  SectorStatus,
  SectorTimelineItem,
} from '@/features/Mantenimiento/MaintenanceOrders/components/SectorTimeline';
import type { EquipmentOrderDetail } from '../../lib/actions/vehicle-operations-actions';
import type { BadgeVariant } from '../../lib/order-status';

/**
 * Modelo del diálogo de detalle de una orden: tipos, rótulos y funciones puras que arman los sectores, las
 * tareas, las órdenes de trabajo y los comentarios a partir del detalle que devuelve el servidor.
 */

export type OrderDetailItem = EquipmentOrderDetail['maintenance_order_items'][number];

export interface SectorGroup {
  sectorId: string;
  sectorName: string;
  sequenceOrder: number;
  items: OrderDetailItem[];
}

export interface SectorTask {
  id: string;
  repairTypeName: string;
  status: string;
  isDiagnostico: boolean;
  isAutorizable: boolean;
  isOperatorAdded: boolean;
}

// ============================================================================
// RÓTULOS Y VARIANTES
// ============================================================================

export const repairStatusBadgeVariants: Record<string, BadgeVariant> = {
  pending: 'secondary',
  pending_approval: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  rejected: 'destructive',
  reassignment_requested: 'destructive',
  blocked: 'outline',
};

export const repairStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  pending_approval: 'Pend. Aprobacion',
  in_progress: 'En progreso',
  completed: 'Completado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
  reassignment_requested: 'Reasignacion',
  blocked: 'Bloqueado',
};

export const sectorStatusBadge: Record<SectorStatus, BadgeVariant> = {
  blocked: 'outline',
  pending: 'secondary',
  in_progress: 'warning',
  paused: 'outline',
  completed: 'success',
};

export const sectorStatusLabels: Record<SectorStatus, string> = {
  blocked: 'Bloqueado',
  pending: 'Pendiente',
  in_progress: 'En progreso',
  paused: 'Pausado',
  completed: 'Completado',
};

export const workOrderStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  paused: 'Pausada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const workOrderStatusVariants: Record<string, BadgeVariant> = {
  pending: 'outline',
  in_progress: 'default',
  paused: 'yellow',
  completed: 'success',
  cancelled: 'destructive',
};

export const requestSourceLabels: Record<string, string> = {
  preventive: 'Preventivo',
  checklist: 'Checklist',
  manual: 'Manual',
};

// ============================================================================
// SECTORES Y TAREAS
// ============================================================================

/** Reparaciones de un ítem dentro de SU orden de trabajo (la OT puede traer los ítems de otras tareas). */
function getRepairsForItem(item: OrderDetailItem) {
  return (item.work_orders?.work_order_items ?? [])
    .filter((workOrderItem) => workOrderItem.maintenance_order_item_id === item.id)
    .flatMap((workOrderItem) => workOrderItem.work_order_item_repairs);
}

function getGroupRepairs(groupItems: OrderDetailItem[]) {
  return groupItems.flatMap(getRepairsForItem);
}

export function buildSectorGroups(items: OrderDetailItem[]): SectorGroup[] {
  const groups = new Map<string, SectorGroup>();

  for (const item of items) {
    const sectorId = item.assigned_sector_id;
    if (!sectorId) continue;

    const group = groups.get(sectorId) ?? {
      sectorId,
      sectorName: item.workshop_sectors?.name ?? 'Sin sector',
      sequenceOrder: item.sector_sequence_order ?? 999,
      items: [],
    };
    group.items.push(item);
    groups.set(sectorId, group);
  }

  return Array.from(groups.values()).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

export function buildTimelineData(sectorGroups: SectorGroup[]): SectorTimelineItem[] {
  return sectorGroups.map((group, index) => {
    const allRepairs = getGroupRepairs(group.items);
    const totalTasks = allRepairs.length || group.items.length;
    const completedTasks = allRepairs.filter((repair) => repair.status === 'completed').length;
    const diagnosticoItem = group.items.find((item) => item.is_diagnostico);
    const diagnosticoCompleted = (diagnosticoItem ? getRepairsForItem(diagnosticoItem) : []).some(
      (repair) => repair.status === 'completed'
    );

    let sectorStatus: SectorStatus = 'pending';
    if (completedTasks === totalTasks && totalTasks > 0) {
      sectorStatus = 'completed';
    } else if (completedTasks > 0) {
      sectorStatus = 'in_progress';
    } else if (index > 0) {
      // Un sector queda bloqueado mientras el anterior de la secuencia no terminó.
      const previousGroup = sectorGroups[index - 1];
      const previousRepairs = getGroupRepairs(previousGroup.items);
      const previousTotal = previousRepairs.length || previousGroup.items.length;
      const previousCompleted = previousRepairs.filter((repair) => repair.status === 'completed').length;
      if (previousCompleted < previousTotal) sectorStatus = 'blocked';
    }

    return {
      sectorId: group.sectorId,
      sectorName: group.sectorName,
      sequenceOrder: group.sequenceOrder,
      status: sectorStatus,
      totalTasks,
      completedTasks,
      diagnosticoCompleted,
    };
  });
}

export function getSectorTasks(group: SectorGroup): SectorTask[] {
  const tasks: SectorTask[] = [];

  for (const item of group.items) {
    const repairs = getRepairsForItem(item);

    if (repairs.length > 0) {
      for (const repair of repairs) {
        tasks.push({
          id: repair.id,
          repairTypeName: repair.is_diagnostico
            ? 'DIAGNOSTICO'
            : repair.types_of_repairs?.name ?? item.description ?? 'Sin descripcion',
          status: repair.status,
          isDiagnostico: repair.is_diagnostico,
          isAutorizable: repair.types_of_repairs?.autorizable ?? false,
          isOperatorAdded: repair.is_operator_added ?? false,
        });
      }
    } else {
      // Ítem sin reparaciones cargadas todavía: se muestra como tarea pendiente.
      tasks.push({
        id: item.id,
        repairTypeName: item.is_diagnostico
          ? 'DIAGNOSTICO'
          : item.types_of_repairs?.name ?? item.description ?? 'Sin descripcion',
        status: 'pending',
        isDiagnostico: item.is_diagnostico,
        isAutorizable: item.types_of_repairs?.autorizable ?? false,
        isOperatorAdded: false,
      });
    }
  }

  return tasks;
}

// ============================================================================
// ÓRDENES DE TRABAJO Y COMENTARIOS
// ============================================================================

/** Órdenes de trabajo distintas de la orden de mantenimiento (varios ítems pueden compartir una OT). */
export function collectWorkOrders(items: OrderDetailItem[]) {
  const workOrders = new Map<string, NonNullable<OrderDetailItem['work_orders']>>();

  for (const item of items) {
    if (item.work_orders && !workOrders.has(item.work_orders.id)) {
      workOrders.set(item.work_orders.id, item.work_orders);
    }
  }

  return Array.from(workOrders.values());
}

export interface RequestComment {
  type: 'driver' | 'validator';
  text: string;
  itemDescription: string;
}

/** Comentarios del chofer y del validador de la solicitud, sin repetir el mismo texto para el mismo ítem. */
export function collectRequestComments(items: OrderDetailItem[], source: string | null | undefined): RequestComment[] {
  const isManual = source === 'manual';
  const comments: RequestComment[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const requestItem = item.maintenance_request_items;
    if (!requestItem) continue;

    const itemDescription = item.types_of_repairs?.name || item.description || requestItem.description || 'Item';

    if (requestItem.driver_comment) {
      const key = `${requestItem.driver_comment.trim().toLowerCase()}-${itemDescription}`;
      if (!seen.has(key)) {
        // En una solicitud manual no hay chofer: el comentario es del supervisor que la cargó.
        comments.push({ type: isManual ? 'validator' : 'driver', text: requestItem.driver_comment, itemDescription });
        seen.add(key);
      }
    }

    if (requestItem.validator_comment) {
      const normalized = requestItem.validator_comment.trim().toLowerCase();
      const key = `${normalized}-${itemDescription}`;
      const sameAsDriver = normalized === requestItem.driver_comment?.trim().toLowerCase();
      if (!seen.has(key) && !sameAsDriver) {
        comments.push({ type: 'validator', text: requestItem.validator_comment, itemDescription });
        seen.add(key);
      }
    }
  }

  return comments;
}
