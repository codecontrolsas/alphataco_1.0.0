import 'server-only';

import {
  APPROVED_WITHOUT_ORDER_REQUEST_WHERE,
  PENDING_APPROVAL_REQUEST_WHERE,
} from '@/features/Mantenimiento/lib/open-requests';
import { MAINTENANCE_ORDER_TERMINAL_STATUSES } from '@/features/Mantenimiento/lib/order-status';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';

/**
 * ¿El equipo (vehículo o equipamiento) tiene mantenimiento pendiente? Módulo sin directiva
 * `'use server'`: lo usan las server actions de la ficha, no se expone al cliente.
 *
 * Cuenta como pendiente:
 * - pedidos (`maintenance_orders`) que no están en un estado terminal (`completed` / `rejected`);
 * - solicitudes (`maintenance_requests`) en `pending_approval`, o `approved` sin ningún pedido todavía
 *   (las `rejected` están cerradas);
 * - órdenes de trabajo (`work_orders`) abiertas: `pending`, `in_progress` o `paused`.
 */

export type MaintenanceResourceKind = 'vehicles' | 'other_equipment';

type MaintenanceClient = Prisma.TransactionClient | typeof prisma;

/** Estados terminales de `maintenance_orders` (ver `Mantenimiento/lib/order-status.ts`). */
export const TERMINAL_ORDER_STATUSES = ['completed', 'rejected'];
const OPEN_WORK_ORDER_STATUSES = ['pending', 'in_progress', 'paused'] as const;

export interface PendingMaintenanceResult {
  pending: boolean;
  reasons: string[];
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export async function hasPendingMaintenance(
  client: MaintenanceClient,
  companyId: string,
  resourceKind: MaintenanceResourceKind,
  resourceId: string
): Promise<PendingMaintenanceResult> {
  // Los tres modelos se vinculan al equipo por `equipment_id` (vehículo) u `other_equipment_id`.
  const owner = resourceKind === 'vehicles' ? { equipment_id: resourceId } : { other_equipment_id: resourceId };

  const [openOrders, pendingApproval, approvedWithoutOrder, openWorkOrders] = await Promise.all([
    client.maintenance_orders.count({
      where: { ...owner, company_id: companyId, status: { notIn: [...MAINTENANCE_ORDER_TERMINAL_STATUSES] } },
    }),
    client.maintenance_requests.count({
      where: { ...owner, company_id: companyId, ...PENDING_APPROVAL_REQUEST_WHERE },
    }),
    client.maintenance_requests.count({
      where: { ...owner, company_id: companyId, ...APPROVED_WITHOUT_ORDER_REQUEST_WHERE },
    }),
    client.work_orders.count({
      where: { ...owner, company_id: companyId, status: { in: [...OPEN_WORK_ORDER_STATUSES] } },
    }),
  ]);

  const reasons: string[] = [];
  if (openOrders > 0) {
    reasons.push(
      `Tiene ${openOrders} ${plural(openOrders, 'pedido de mantenimiento abierto', 'pedidos de mantenimiento abiertos')}`
    );
  }
  if (pendingApproval > 0) {
    reasons.push(
      `Tiene ${pendingApproval} ${plural(pendingApproval, 'solicitud de mantenimiento pendiente de aprobación', 'solicitudes de mantenimiento pendientes de aprobación')}`
    );
  }
  if (approvedWithoutOrder > 0) {
    reasons.push(
      `Tiene ${approvedWithoutOrder} ${plural(approvedWithoutOrder, 'solicitud aprobada', 'solicitudes aprobadas')} sin pedido de mantenimiento`
    );
  }
  if (openWorkOrders > 0) {
    reasons.push(
      `Tiene ${openWorkOrders} ${plural(openWorkOrders, 'orden de trabajo abierta', 'órdenes de trabajo abiertas')}`
    );
  }

  return { pending: reasons.length > 0, reasons };
}
