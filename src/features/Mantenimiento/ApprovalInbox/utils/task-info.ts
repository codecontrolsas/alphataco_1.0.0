import { toResourceCellResource } from '../../shared/components/ResourceCell';
import type { PendingTaskData, ReturnedTaskData } from '../actions/actionsServer';

type InboxTask = PendingTaskData | ReturnedTaskData;

/** Datos anidados de una tarea de la bandeja (autorización o reasignación), ya resueltos para la tarjeta. */
export function getTaskInfo(task: InboxTask) {
  const orderItem = task.work_order_items?.maintenance_order_items ?? null;
  const order = orderItem?.maintenance_orders ?? null;
  // Ticket 596: el pedido puede ser de un vehículo o de un equipamiento.
  const resourceRow = { vehicles: order?.vehicles ?? null, other_equipment: order?.other_equipment ?? null };

  return {
    repairTypeName: task.types_of_repairs?.name ?? 'Sin tipo',
    orderNumber: order?.order_number ?? null,
    resource: toResourceCellResource(resourceRow),
    sectorName: orderItem?.workshop_sectors?.name ?? null,
    itemDescription: orderItem?.description ?? null,
    driverComment: orderItem?.maintenance_request_items?.driver_comment ?? null,
    workOrderId: task.work_order_items?.work_order_id ?? null,
    orderId: order?.id ?? null,
    orderStatus: order?.status ?? null,
  };
}
