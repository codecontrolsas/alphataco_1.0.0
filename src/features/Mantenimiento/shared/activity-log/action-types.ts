/**
 * Catálogo único de action_type usados en maintenance_activity_log.
 * Toda mutation que loguea actividad DEBE usar una constante de aquí.
 */
export const ACTIVITY_LOG = {
  // ── Eventos existentes (se documentan, no se modifican) ──────────
  CREATED: 'created',
  REQUEST_APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  DATE_CONFIRMED: 'date_confirmed',
  DATE_REJECTED: 'date_rejected',
  WORKSHOP_ENTRY: 'workshop_entry',
  REJECTED: 'rejected',
  WORKSHOP_APPROVED: 'workshop_approved',
  OPERATIONS_APPROVED: 'operations_approved',
  WORKSHOP_ITEM_REJECTED: 'workshop_item_rejected',
  OPERATIONS_ITEM_REJECTED: 'operations_item_rejected',
  WORKSHOP_AGREED_OPS_REJECTION: 'workshop_agreed_ops_rejection',
  WORKSHOP_DISAGREED_OPS_REJECTION: 'workshop_disagreed_ops_rejection',
  WORKSHOP_REJECTED_ALL_ITEMS: 'workshop_rejected_all_items',
  WORKSHOP_RESTORED_FROM_REJECTED: 'workshop_restored_from_rejected',
  WORK_ORDER_CREATED: 'work_order_created',
  /**
   * OT finalizada, registrada contra el PEDIDO (maintenance_order_id).
   * El cierre de la OT ya se loguea contra la propia OT (WO_CLOSED / EXTERNAL_WO_COMPLETED),
   * pero esos registros solo se ven en el acordeon de la OT: el historial del pedido
   * los filtra por maintenance_order_id y por eso el evento no aparecia en la linea de tiempo.
   */
  WORK_ORDER_COMPLETED: 'work_order_completed',

  // ── OrderManagement (nuevos) ────────────────────────────────────
  ORDER_ITEMS_UPDATED: 'order_items_updated',
  ORDER_ITEMS_ASSIGNED: 'order_items_assigned',
  ORDER_ITEM_ADDED: 'order_item_added',
  ORDER_ITEM_REPAIR_TYPES_UPDATED: 'order_item_repair_types_updated',
  ORDER_ITEM_REMOVED: 'order_item_removed',
  ORDER_NUMBER_GENERATED: 'order_number_generated',
  WORK_ORDERS_GENERATED: 'work_orders_generated',

  // ── MaintenanceOrders (nuevos) ──────────────────────────────────
  WORKSHOP_RETURNED_ORDER: 'workshop_returned_order',
  SECTOR_EXECUTION_ORDER_UPDATED: 'sector_execution_order_updated',
  EXTERNAL_WO_COMPLETED: 'external_wo_completed',

  // ── ApprovalInbox (nuevos) ──────────────────────────────────────
  REPAIR_TASK_APPROVED: 'repair_task_approved',
  REPAIR_TASK_REJECTED: 'repair_task_rejected',
  REPAIR_TASK_REASSIGNED: 'repair_task_reassigned',

  // ── OperatorPanel (nuevos) ──────────────────────────────────────
  WO_STARTED: 'wo_started',
  WO_PAUSED: 'wo_paused',
  WO_RESUMED: 'wo_resumed',
  WO_CLOSED: 'wo_closed',
  REPAIR_COMPLETED: 'repair_completed',
  REPAIR_UNCOMPLETED: 'repair_uncompleted',
  REPAIR_TECHNICIAN_NOTES_UPDATED: 'repair_technician_notes_updated',
  REPAIR_RETURNED_TO_CHIEF: 'repair_returned_to_chief',
  TASK_ADDED_BY_OPERATOR: 'task_added_by_operator',
  TASK_REQUESTED_FOR_OTHER_SECTOR: 'task_requested_for_other_sector',

  // ── Almacenes (etapa 4) ─────────────────────────────────────────
  /** Pedido de materiales imputado a la orden (desde la OT o desde el detalle de la orden). */
  MATERIAL_REQUEST_CREATED: 'material_request_created',
} as const;

export type ActivityActionType = (typeof ACTIVITY_LOG)[keyof typeof ACTIVITY_LOG];
