import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { findMaintenanceOrderIdByWorkOrder } from '@/features/Mantenimiento/shared/work-order-order';
import { normalizeDecimal, type DestinationInput } from '../schemas/stock-movement';
import { nextMaterialRequestNumber } from './request-numbering';
import { validateExitDestination } from './stock-engine';
import { StockError } from './stock-errors';

type Tx = Prisma.TransactionClient;

export interface CreateMaterialRequestInput {
  destination: DestinationInput;
  /** OT desde la que se pide (etapa 4): solo con destino orden de mantenimiento. */
  workOrderId: string | null;
  notes: string | null;
  lines: { materialId: string; quantity: string }[];
}

/** Estados en los que una OT ya no admite pedidos de materiales. */
const CLOSED_WORK_ORDER_STATUSES = ['completed', 'completed_partial', 'cancelled'] as const;

/**
 * Alta de un pedido de materiales en `PENDING_APPROVAL`. Es el unico camino de alta: la llaman
 * Almacenes (`pedidos:create`), el panel del operario (perimetro de la OT) y el detalle de la
 * orden de mantenimiento. Cada entrada autoriza ANTES de llamarla; aca se valida el contenido.
 */
export async function createMaterialRequest(
  tx: Tx,
  companyId: string,
  requestedBy: string,
  input: CreateMaterialRequestInput
): Promise<{ id: string; number: string }> {
  if (input.lines.length === 0) throw new StockError('INVALID_INPUT', 'Agregá al menos una línea');

  // Pedido a una orden de mantenimiento: se lockea la orden ANTES de validarla. Completarla
  // tambien la lockea (y despues busca pedidos abiertos), asi un pedido no puede colarse entre
  // ese chequeo y el cierre. Orden de locks: orden de mantenimiento → pedido.
  if (input.destination.destinationType === 'MAINTENANCE_ORDER' && input.destination.maintenanceOrderId) {
    await lockMaintenanceOrder(tx, input.destination.maintenanceOrderId);
  }

  const materialIds = [...new Set(input.lines.map((l) => l.materialId))];
  const materials = await tx.materials.findMany({
    where: { id: { in: materialIds }, company_id: companyId },
    select: { id: true, name: true, is_active: true, tracking_type: true },
  });
  const byId = new Map(materials.map((m) => [m.id, m]));
  for (const line of input.lines) {
    const material = byId.get(line.materialId);
    if (!material) throw new StockError('NOT_FOUND', 'Uno de los materiales no existe en la empresa');
    if (!material.is_active) throw new StockError('INACTIVE_MATERIAL', `${material.name} está inactivo`);
    const quantity = Number(normalizeDecimal(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new StockError('INVALID_INPUT', `La cantidad de ${material.name} tiene que ser mayor a 0`);
    }
    if (material.tracking_type === 'SERIAL' && !Number.isInteger(quantity)) {
      throw new StockError('INVALID_INPUT', `${material.name} se entrega por unidad: la cantidad tiene que ser entera`);
    }
  }

  const destination = input.destination;
  await validateExitDestination(tx, companyId, destination);

  if (input.workOrderId) {
    if (destination.destinationType !== 'MAINTENANCE_ORDER' || !destination.maintenanceOrderId) {
      throw new StockError('INVALID_DESTINATION', 'Una OT solo se puede indicar en un pedido a una orden de mantenimiento');
    }
    const workOrder = await tx.work_orders.findFirst({
      where: { id: input.workOrderId, company_id: companyId },
      select: { status: true, order_number: true },
    });
    const orderId = workOrder ? await findMaintenanceOrderIdByWorkOrder(tx, input.workOrderId) : null;
    if (!workOrder || orderId !== destination.maintenanceOrderId) {
      throw new StockError('INVALID_DESTINATION', 'La OT no pertenece a la orden de mantenimiento');
    }
    if ((CLOSED_WORK_ORDER_STATUSES as readonly string[]).includes(workOrder.status)) {
      throw new StockError('INVALID_DESTINATION', `La OT ${workOrder.order_number} ya está cerrada: no admite pedidos`);
    }
  }

  const number = await nextMaterialRequestNumber(tx, companyId);
  const created = await tx.material_requests.create({
    data: {
      company_id: companyId,
      number,
      requested_by: requestedBy,
      destination_type: destination.destinationType!,
      employee_id: destination.employeeId,
      vehicle_id: destination.vehicleId,
      other_equipment_id: destination.otherEquipmentId,
      maintenance_order_id: destination.maintenanceOrderId,
      customer_id: destination.customerId,
      customer_service_id: destination.customerServiceId,
      work_order_id: input.workOrderId,
      notes: input.notes,
      lines: {
        create: input.lines.map((l) => ({ material_id: l.materialId, quantity: normalizeDecimal(l.quantity) })),
      },
    },
    select: { id: true, number: true },
  });

  // El pedido aparece en el historial de la orden (spec etapa 4 §3.4).
  if (destination.destinationType === 'MAINTENANCE_ORDER' && destination.maintenanceOrderId) {
    await logActivity(tx, {
      maintenanceOrderId: destination.maintenanceOrderId,
      workOrderId: input.workOrderId,
      actionType: ACTIVITY_LOG.MATERIAL_REQUEST_CREATED,
      performedBy: requestedBy,
      companyId,
      notes: `${created.number}: ${input.lines.length === 1 ? '1 material' : `${input.lines.length} materiales`}`,
      metadata: { material_request_id: created.id, number: created.number, line_count: input.lines.length },
    });
  }

  return created;
}
