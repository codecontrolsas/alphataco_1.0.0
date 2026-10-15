import type {
  work_order_item_repairs,
  work_order_item_status,
  work_order_items,
  work_order_priority,
  work_order_status,
  work_orders,
} from '@/generated/prisma/client';
import {
  REPAIR_STATUS_UI,
  TONE_TO_BADGE,
  WORK_ORDER_STATUS_UI,
  type BadgeVariant,
} from '../lib/status-presentation';

// Tipos base de la BD (modelos y enums generados por Prisma)
export type WorkOrder = work_orders;
export type WorkOrderItem = work_order_items;
export type WorkOrderStatus = work_order_status;
export type WorkOrderItemStatus = work_order_item_status;
export type WorkOrderPriority = work_order_priority;
export type WorkOrderItemRepairRow = work_order_item_repairs;

// Tipo para un trabajo individual (tipo de reparación) dentro de un item
export interface WorkOrderItemRepair {
  id: string;
  repairTypeId: string;
  repairTypeName: string;
  status: WorkOrderItemStatus;
  technicianNotes: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

// Tipo para la fila de la tabla de OT
export interface WorkOrderRowData {
  id: string;
  orderNumber: string;
  sequenceNumber: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  // Equipo
  /** Nullable desde el ticket 596: la OT puede ser de un equipamiento, no de un vehículo */
  equipmentId: string | null;
  vehicleDomain: string | null;
  vehicleSerie: string | null;
  vehicleInternNumber: string | null;
  /** Ticket 596: identificacion del recurso, sea vehiculo o equipamiento */
  resourceLabel: string;
  resourceKindLabel: string;
  resourceInternNumber: string | null;
  resourceType: string | null;
  vehicleType: string | null;
  // Taller y sector
  workshopId: string;
  workshopName: string;
  workshopType: string;
  sectorId: string | null;
  sectorName: string | null;
  // Fechas planificadas
  plannedStartDate: string;
  plannedEndDate: string;
  // Fechas reales
  actualStartDate: string | null;
  actualEndDate: string | null;
  // Conteo de items
  totalItems: number;
  completedItems: number;
  // Notas
  notes: string | null;
  // Auditoría
  createdAt: string | null;
  createdBy: string | null;
  // Pausa
  pausedAt: string | null;
  pauseReason: string | null;
  totalPausedTime: string | null;
}

// Tipo para los items de una OT en el detalle (representa el desvío/item de mantenimiento)
export interface WorkOrderItemDetail {
  id: string;
  status: WorkOrderItemStatus;
  technicianNotes: string | null;
  completedAt: string | null;
  // Datos del maintenance_order_item
  maintenanceOrderItemId: string;
  repairTypeId: string | null;
  repairTypeName: string | null;
  // Múltiples tipos de reparación (tabla pivot) - legacy
  repairTypeIds: string[];
  repairTypeNames: string[];
  // Trabajos individuales a realizar (cada tipo de reparación)
  repairs: WorkOrderItemRepair[];
  // Contadores
  totalRepairs: number;
  completedRepairs: number;
  // Descripción y comentarios
  description: string | null;
  driverComment: string | null;
  validatorComment: string | null;
  // Datos del desvío (si viene de checklist)
  deviationId: string | null;
  itemLabel: string | null;
  itemCode: string | null;
  sectionCode: string | null;
  /** Ticket 592: fotos del ítem (bucket repair-images), vengan de la orden o de la solicitud */
  itemImages: string[];
  /** Grupo de reparaciones del que salio el item, null si se cargo suelto */
  itemGroupName: string | null;
}

// Tipo para el detalle completo de una OT
export interface WorkOrderDetail extends WorkOrderRowData {
  items: WorkOrderItemDetail[];
  // Info adicional del equipo
  vehicleKilometer: string | null;
  vehicleEngineHours: number | null;
  vehicleCondition: string | null;
  // Info adicional
  startedAt: string | null;
  startedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  // Pausa
  pausedBy: string | null;
}

// Constantes de estados (derivadas de la fuente única `lib/status-presentation.ts`)
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: WORK_ORDER_STATUS_UI.pending.label,
  in_progress: WORK_ORDER_STATUS_UI.in_progress.label,
  paused: WORK_ORDER_STATUS_UI.paused.label,
  completed: WORK_ORDER_STATUS_UI.completed.label,
  completed_partial: WORK_ORDER_STATUS_UI.completed_partial.label,
  cancelled: WORK_ORDER_STATUS_UI.cancelled.label,
};

export const WORK_ORDER_STATUS_VARIANTS: Record<WorkOrderStatus, BadgeVariant> = {
  pending: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.pending.tone],
  in_progress: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.in_progress.tone],
  paused: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.paused.tone],
  completed: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.completed.tone],
  completed_partial: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.completed_partial.tone],
  cancelled: TONE_TO_BADGE[WORK_ORDER_STATUS_UI.cancelled.tone],
};

// Constantes de prioridad
export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const WORK_ORDER_PRIORITY_VARIANTS: Record<
  WorkOrderPriority,
  'destructive' | 'warning' | 'secondary' | 'default'
> = {
  urgent: 'destructive',
  high: 'warning',
  medium: 'secondary',
  low: 'default',
};

export const WORK_ORDER_ITEM_STATUS_LABELS: Record<WorkOrderItemStatus, string> = {
  pending: REPAIR_STATUS_UI.pending.label,
  in_progress: REPAIR_STATUS_UI.in_progress.label,
  completed: REPAIR_STATUS_UI.completed.label,
  cancelled: REPAIR_STATUS_UI.cancelled.label,
  pending_approval: REPAIR_STATUS_UI.pending_approval.label,
  reassignment_requested: REPAIR_STATUS_UI.reassignment_requested.label,
  rejected: REPAIR_STATUS_UI.rejected.label,
};
