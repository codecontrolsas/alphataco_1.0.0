import type { PendingTaskData, ReturnedTaskData } from '../actions/actionsServer';

type InboxTask = PendingTaskData | ReturnedTaskData;

/** Datos anidados de una tarea de la bandeja (autorización o reasignación), ya resueltos para la tarjeta. */
export function getTaskInfo(task: InboxTask) {
  const orderItem = task.work_order_items?.maintenance_order_items ?? null;
  const order = orderItem?.maintenance_orders ?? null;
  const vehicle = order?.vehicles ?? null;

  const identifier =
    vehicle?.domain || vehicle?.serie || (vehicle?.intern_number ? `N° ${vehicle.intern_number}` : '-');

  return {
    repairTypeName: task.types_of_repairs?.name ?? 'Sin tipo',
    orderNumber: order?.order_number ?? null,
    resource: {
      kind: 'vehicle' as const,
      identifier,
      internNumber: vehicle?.intern_number ?? null,
    },
    sectorName: orderItem?.workshop_sectors?.name ?? null,
    itemDescription: orderItem?.description ?? null,
    driverComment: orderItem?.maintenance_request_items?.driver_comment ?? null,
    workOrderId: task.work_order_items?.work_order_id ?? null,
  };
}
