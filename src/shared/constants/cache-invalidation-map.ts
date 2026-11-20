import { CACHE_TAGS } from './cache';

const T = CACHE_TAGS;

// ── Empresa / Usuarios ──
export const COMPANY_USERS_INVALIDATION = [T.COMPANY_USERS] as const;

/**
 * Matriz de invalidacion: cada mutacion → tags afectados.
 *
 * Cuando una mutacion se ejecuta exitosamente, se llama
 * `invalidateCacheTags(INVALIDATION_MAP.nombreMutacion)` para invalidar
 * SOLO los caches afectados por esa accion.
 *
 * Documentacion del flujo completo: ver plan en `.claude/plans/`.
 */
export const INVALIDATION_MAP = {
  // ── Solicitudes ──
  approveMaintenanceRequestItems: [
    T.MAINTENANCE_REQUESTS,
    T.MAINTENANCE_ORDERS,
    T.TAB_SOLICITUDES,
    T.TAB_PEDIDOS_PENDIENTES,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
    T.TAB_REPAIR_SOLICITUDES,
    T.VEHICLES,
  ],
  rejectMaintenanceRequest: [
    T.MAINTENANCE_REQUESTS,
    T.TAB_SOLICITUDES,
    T.PIPELINE_OPERACIONES,
    T.TAB_REPAIR_SOLICITUDES,
  ],
  rejectMaintenanceRequestItems: [
    T.MAINTENANCE_REQUESTS,
    T.TAB_SOLICITUDES,
    T.PIPELINE_OPERACIONES,
    T.TAB_REPAIR_SOLICITUDES,
  ],
  reassignRequestSupervisor: [T.MAINTENANCE_REQUESTS, T.TAB_SOLICITUDES],
  createMaintenanceRequest: [
    T.MAINTENANCE_REQUESTS,
    T.TAB_SOLICITUDES,
    T.PIPELINE_OPERACIONES,
    T.TAB_REPAIR_SOLICITUDES,
    T.TAB_EQUIPMENTS_DEVIATIONS,
  ],

  // ── Operaciones ──
  rejectMaintenanceOperation: [
    T.MAINTENANCE_ORDERS,
    T.TAB_PENDIENTES_EJECUTAR,
    T.TAB_PEDIDOS_PENDIENTES,
    T.TAB_PARA_TALLER,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  approveWorkshopEntry: [
    T.MAINTENANCE_ORDERS,
    T.TAB_PENDIENTES_EJECUTAR,
    T.TAB_PARA_TALLER,
    T.TAB_CONFIRMADOS,
    T.TAB_WORKSHOP_TRACKING,
    T.TAB_IN_WORKSHOP,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
    T.VEHICLES,
  ],

  // ── Planificacion ──
  scheduleMaintenanceOrder: [
    T.MAINTENANCE_ORDERS,
    T.TAB_PEDIDOS_PENDIENTES,
    T.TAB_PENDIENTES_EJECUTAR,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  /**
   * Ticket 676: rechazo del taller en el paso "Por Programar". Toca el pedido y
   * su solicitud de origen, asi que invalida los dos pipelines y la tab de
   * solicitudes ademas del listado de pendientes.
   */
  rejectPendingOrder: [
    T.MAINTENANCE_ORDERS,
    T.MAINTENANCE_REQUESTS,
    T.TAB_PEDIDOS_PENDIENTES,
    T.TAB_SOLICITUDES,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  assignWorkshopToItems: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES],
  createWorkOrder: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES, T.TAB_IN_WORKSHOP, T.PIPELINE_TALLER],

  // ── MaintenanceOrders (validaciones) ──
  workshopChiefValidateOrder: [
    T.MAINTENANCE_ORDERS,
    T.TAB_IN_WORKSHOP,
    T.TAB_WORKSHOP_TRACKING,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  workshopChiefReturnOrder: [
    T.MAINTENANCE_ORDERS,
    T.TAB_IN_WORKSHOP,
    T.TAB_WORKSHOP_TRACKING,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  operationsValidateOrder: [
    T.MAINTENANCE_ORDERS,
    T.TAB_WORKSHOP_TRACKING,
    T.TAB_IN_WORKSHOP,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
    T.VEHICLES,
  ],
  operationsRejectOrder: [
    T.MAINTENANCE_ORDERS,
    T.TAB_WORKSHOP_TRACKING,
    T.TAB_IN_WORKSHOP,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  operationsRejectItems: [
    T.MAINTENANCE_ORDERS,
    T.TAB_WORKSHOP_TRACKING,
    T.TAB_IN_WORKSHOP,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  workshopChiefRejectItems: [
    T.MAINTENANCE_ORDERS,
    T.TAB_IN_WORKSHOP,
    T.TAB_WORKSHOP_TRACKING,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
  ],
  workshopChiefHandleOperationsRejection: [
    T.MAINTENANCE_ORDERS,
    T.TAB_IN_WORKSHOP,
    T.TAB_WORKSHOP_TRACKING,
    T.PIPELINE_OPERACIONES,
  ],
  updateSectorExecutionOrder: [T.MAINTENANCE_ORDERS, T.TAB_IN_WORKSHOP],
  completeExternalWorkOrder: [T.MAINTENANCE_ORDERS, T.TAB_IN_WORKSHOP, T.TAB_WORKSHOP_TRACKING],

  // ── OrderManagement ──
  assignItemsToSectors: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES, T.TAB_IN_WORKSHOP],
  addItemToOrder: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES, T.TAB_IN_WORKSHOP],
  saveOrderChanges: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES, T.TAB_IN_WORKSHOP],
  generateWorkOrdersForOrder: [T.MAINTENANCE_ORDERS, T.TAB_IN_WORKSHOP, T.PIPELINE_TALLER],
  setupAndGenerateWorkOrders: [T.MAINTENANCE_ORDERS, T.TAB_PEDIDOS_PENDIENTES, T.TAB_IN_WORKSHOP, T.PIPELINE_TALLER],

  // ── OperatorPanel (work orders) ──
  startWorkOrder: [T.MAINTENANCE_ORDERS, T.TAB_IN_WORKSHOP, T.TAB_WORKSHOP_TRACKING],

  // ── ApprovalInbox ──
  approveTask: [T.WORK_ORDER_REPAIRS, T.MAINTENANCE_ORDERS, T.TAB_APPROVALS, T.TAB_IN_WORKSHOP],
  rejectTask: [T.WORK_ORDER_REPAIRS, T.MAINTENANCE_ORDERS, T.TAB_APPROVALS, T.TAB_IN_WORKSHOP],
  reassignTaskToSector: [
    T.WORK_ORDER_REPAIRS,
    T.MAINTENANCE_ORDERS,
    T.TAB_APPROVALS,
    T.TAB_IN_WORKSHOP,
    T.PIPELINE_TALLER,
  ],

  // ── NuevoPedido ──
  createMaintenanceOrderDirect: [
    T.MAINTENANCE_ORDERS,
    T.TAB_PEDIDOS_PENDIENTES,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
    T.VEHICLES,
  ],
  createMaintenanceOrderFromDeviations: [
    T.MAINTENANCE_REQUESTS,
    T.MAINTENANCE_ORDERS,
    T.TAB_SOLICITUDES,
    T.TAB_PEDIDOS_PENDIENTES,
    T.PIPELINE_OPERACIONES,
    T.PIPELINE_TALLER,
    T.TAB_REPAIR_SOLICITUDES,
    T.TAB_EQUIPMENTS_DEVIATIONS,
    T.VEHICLES,
  ],
  createMaintenanceRequestPendingApproval: [
    T.MAINTENANCE_REQUESTS,
    T.TAB_SOLICITUDES,
    T.PIPELINE_OPERACIONES,
    T.TAB_REPAIR_SOLICITUDES,
    T.TAB_EQUIPMENTS_DEVIATIONS,
  ],
} as const;
