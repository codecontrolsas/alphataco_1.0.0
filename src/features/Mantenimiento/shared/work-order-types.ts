import type { work_order_item_status, work_order_priority, work_order_status } from '@/generated/prisma/client';
import { REPAIR_STATUS_UI, WORK_ORDER_STATUS_UI } from '../lib/status-presentation';
export type WorkOrderStatus = work_order_status;
export type WorkOrderItemStatus = work_order_item_status;
export type WorkOrderPriority = work_order_priority;

// Constantes de estados (derivadas de la fuente única `lib/status-presentation.ts`)
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: WORK_ORDER_STATUS_UI.pending.label,
  in_progress: WORK_ORDER_STATUS_UI.in_progress.label,
  paused: WORK_ORDER_STATUS_UI.paused.label,
  completed: WORK_ORDER_STATUS_UI.completed.label,
  completed_partial: WORK_ORDER_STATUS_UI.completed_partial.label,
  cancelled: WORK_ORDER_STATUS_UI.cancelled.label,
};

// Constantes de prioridad
export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
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
