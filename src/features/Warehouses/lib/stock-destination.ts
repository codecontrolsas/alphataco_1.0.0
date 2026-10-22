import 'server-only';

import type { DestinationInput } from '../schemas/stock-movement';
import { CLOSED_MAINTENANCE_ORDER_STATUSES } from './stock-engine-constants';
import { StockError } from './stock-errors';
import type { Tx } from './stock-locks';

/**
 * El destino de una salida (o de un pedido) tiene que ser de la empresa y estar vigente:
 * empleados, equipos y clientes activos; ordenes de mantenimiento abiertas (no completadas ni
 * rechazadas). La usan el motor y el alta de pedidos.
 */
export async function validateExitDestination(tx: Tx, companyId: string, input: DestinationInput): Promise<void> {
  const invalid = (message: string) => new StockError('INVALID_DESTINATION', message);

  switch (input.destinationType) {
    case 'EMPLOYEE': {
      const found = input.employeeId
        ? await tx.employees.findFirst({
            where: { id: input.employeeId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El empleado no existe o está dado de baja');
      return;
    }
    case 'VEHICLE': {
      const found = input.vehicleId
        ? await tx.vehicles.findFirst({
            where: { id: input.vehicleId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El vehículo no existe o está dado de baja');
      return;
    }
    case 'OTHER_EQUIPMENT': {
      const found = input.otherEquipmentId
        ? await tx.other_equipment.findFirst({
            where: { id: input.otherEquipmentId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El equipo no existe o está dado de baja');
      return;
    }
    case 'MAINTENANCE_ORDER': {
      const found = input.maintenanceOrderId
        ? await tx.maintenance_orders.findFirst({
            where: {
              id: input.maintenanceOrderId,
              company_id: companyId,
              status: { notIn: [...CLOSED_MAINTENANCE_ORDER_STATUSES] },
            },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('La orden de mantenimiento no existe o ya está cerrada');
      return;
    }
    case 'CUSTOMER': {
      const found = input.customerId
        ? await tx.customers.findFirst({
            where: { id: input.customerId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El cliente no existe o está inactivo');
      if (input.customerServiceId) {
        const contract = await tx.customer_services.findFirst({
          where: { id: input.customerServiceId, customer_id: input.customerId },
          select: { id: true },
        });
        if (!contract) throw invalid('El contrato no pertenece al cliente');
      }
      return;
    }
    default:
      throw invalid('Elegí a quién se imputa la salida');
  }
}
