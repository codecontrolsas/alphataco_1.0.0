import 'server-only';

import { buildWorkOrderNumber } from '@/features/Mantenimiento/lib/work-order-generation';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import {
  getResourceKind,
  getResourceLabel,
  resourceIdFields,
  type MaintenanceResourceKind,
} from '@/features/Mantenimiento/shared/maintenance-resource';
import { nextWorkOrderSequence } from '@/features/Mantenimiento/shared/order-numbering';
import type { Prisma } from '@/generated/prisma/client';

type Tx = Prisma.TransactionClient;

/** Estados en los que una OT todavía admite tareas nuevas. */
const OPEN_WORK_ORDER_STATUSES = ['pending', 'in_progress', 'paused'] as const;

export interface CreateSectorWorkOrderInput {
  companyId: string;
  resourceKind: MaintenanceResourceKind;
  resourceId: string;
  /** Patente, serie o N° interno: entra en el número de la OT. */
  resourceLabel: string;
  workshopId: string;
  /** `null` para un taller externo (la OT no tiene sector). */
  sectorId: string | null;
  sectorName: string;
  plannedStartDate: Date | string;
  plannedEndDate: Date | string;
  createdBy: string;
}

/**
 * Crea una OT `pending` para un sector (o taller externo) y le toma su número de secuencia dentro de la transacción.
 * Es el cuerpo que usa la generación de OTs del wizard y la reasignación de tareas: una sola forma de numerar y crear.
 */
export async function createSectorWorkOrder(tx: Tx, input: CreateSectorWorkOrderInput) {
  // El número de secuencia se toma DENTRO de la transacción y por empresa: el `max()+1` leído afuera repetía el
  // número entre generaciones simultáneas.
  const sequenceNumber = await nextWorkOrderSequence(tx, input.companyId);

  // OT-{EQUIPO}-{SECTOR/TALLER}-{SECUENCIA}
  const orderNumber = buildWorkOrderNumber({
    resourceLabel: input.resourceLabel,
    sectorName: input.sectorName,
    sequenceNumber,
  });

  return tx.work_orders.create({
    data: {
      order_number: orderNumber,
      sequence_number: sequenceNumber,
      company_id: input.companyId,
      ...resourceIdFields(input.resourceKind, input.resourceId),
      workshop_id: input.workshopId,
      sector_id: input.sectorId ?? undefined,
      status: 'pending',
      priority: 'medium',
      planned_start_date: new Date(input.plannedStartDate),
      planned_end_date: new Date(input.plannedEndDate),
      created_by: input.createdBy,
    },
  });
}

export interface FindOrCreateOpenSectorWorkOrderInput {
  maintenanceOrderId: string;
  sectorId: string;
  companyId: string;
  profileId: string;
  /** Fechas planificadas que hereda la OT si hay que crearla (las de la OT de origen). */
  plannedDates: { plannedStartDate: Date | string; plannedEndDate: Date | string };
}

/**
 * OT abierta del MISMO pedido para el sector, o una nueva `pending` si no hay (con su `WORK_ORDER_CREATED`).
 * La llama `reassignTaskToSector` con el pedido ya bloqueado (`lockMaintenanceOrder`): sin ese lock dos reasignaciones
 * simultáneas al mismo sector crearían dos OTs.
 */
export async function findOrCreateOpenSectorWorkOrder(tx: Tx, input: FindOrCreateOpenSectorWorkOrderInput) {
  const { maintenanceOrderId, sectorId, companyId, profileId, plannedDates } = input;

  const existing = await tx.work_orders.findFirst({
    where: {
      sector_id: sectorId,
      company_id: companyId,
      status: { in: [...OPEN_WORK_ORDER_STATUSES] },
      maintenance_order_items: { some: { maintenance_order_id: maintenanceOrderId } },
    },
    orderBy: { created_at: 'asc' },
    select: { id: true, order_number: true, sector_id: true },
  });
  if (existing) return { workOrder: existing, created: false as const };

  const [sector, order] = await Promise.all([
    tx.workshop_sectors.findFirst({
      where: { id: sectorId, company_id: companyId },
      select: { id: true, name: true, workshop_id: true },
    }),
    tx.maintenance_orders.findFirst({
      where: { id: maintenanceOrderId, company_id: companyId },
      select: {
        equipment_id: true,
        other_equipment_id: true,
        vehicles: { select: { domain: true, serie: true, intern_number: true } },
        other_equipment: { select: { serial_number: true, intern_number: true } },
      },
    }),
  ]);
  if (!sector) throw new Error('El sector de destino no existe');
  if (!order) throw new Error('Pedido de mantenimiento no encontrado');

  const resourceId = order.equipment_id ?? order.other_equipment_id;
  if (!resourceId) throw new Error('No se pudo obtener informacion del equipo');

  const workOrder = await createSectorWorkOrder(tx, {
    companyId,
    resourceKind: getResourceKind(order),
    resourceId,
    resourceLabel: getResourceLabel(order),
    workshopId: sector.workshop_id,
    sectorId: sector.id,
    sectorName: sector.name,
    plannedStartDate: plannedDates.plannedStartDate,
    plannedEndDate: plannedDates.plannedEndDate,
    createdBy: profileId,
  });

  await logActivity(tx, {
    workOrderId: workOrder.id,
    maintenanceOrderId,
    actionType: ACTIVITY_LOG.WORK_ORDER_CREATED,
    performedBy: profileId,
    newStatus: 'pending',
    metadata: {
      orderNumber: workOrder.order_number,
      sectorName: sector.name,
      plannedStartDate: new Date(plannedDates.plannedStartDate).toISOString().slice(0, 10),
      plannedEndDate: new Date(plannedDates.plannedEndDate).toISOString().slice(0, 10),
      isExternal: false,
      reason: 'reassignment',
    },
  });

  return {
    workOrder: { id: workOrder.id, order_number: workOrder.order_number, sector_id: workOrder.sector_id },
    created: true as const,
  };
}
