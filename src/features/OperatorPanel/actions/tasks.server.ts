'use server';

import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { getDiagnosticRepairTypeId } from '@/features/Mantenimiento/utils/diagnostic-repair-type';
import {
  assertAssignedSector,
  assertMaintenanceOrderInScope,
  assertWorkOrderInScope,
  requireOperatorIdentity,
} from '@/features/OperatorPanel/actions/perimeter';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { revalidatePath } from 'next/cache';

const logger = new Logger('OperatorPanel/tasks');

/**
 * Alta de tareas desde el taller: los catálogos de tipos de reparación y las dos formas de
 * sumar trabajo a un pedido (a la propia OT, o pidiéndoselo a otro sector).
 *
 * Los tipos de reparación se acotan a la empresa del operario: `getAllRepairTypes` devolvía
 * el catálogo de TODAS las empresas, y `addTaskToOwnWorkOrder` aceptaba cualquier
 * `repairTypeId` (la FK sola no distingue de quién es cada tipo).
 */

const REPAIR_TYPE_SELECT = { id: true, name: true, autorizable: true, criticity: true } as const;

/** Tipos de reparación habilitados para el sector, sin el DIAGNOSTICO (se crea solo). */
export async function getRepairTypesForSector(sectorId: string) {
  const operator = await assertAssignedSector(sectorId);

  const rows = await prisma.sector_repair_types.findMany({
    where: {
      workshop_sector_id: sectorId,
      types_of_repairs: {
        company_id: operator.companyId,
        // Mismos filtros y mismo orden que `getAllRepairTypes`: un tipo dado de baja seguía
        // apareciendo en el combo del sector.
        is_active: true,
        id: { not: getDiagnosticRepairTypeId(operator.companyId) },
      },
    },
    select: { types_of_repairs: { select: REPAIR_TYPE_SELECT } },
    orderBy: { types_of_repairs: { name: 'asc' } },
    take: 500,
  });

  return rows.map((row) => row.types_of_repairs);
}

// Tipo inferido del retorno — compartido por ambos selectores de tipo de reparación
export type OperatorRepairType = Awaited<ReturnType<typeof getRepairTypesForSector>>[number];

/** Catálogo completo de la empresa, para pedirle trabajo a otro sector. */
export async function getAllRepairTypes(): Promise<OperatorRepairType[]> {
  const operator = await requireOperatorIdentity();

  return prisma.types_of_repairs.findMany({
    where: {
      company_id: operator.companyId,
      is_active: true,
      id: { not: getDiagnosticRepairTypeId(operator.companyId) },
    },
    select: REPAIR_TYPE_SELECT,
    orderBy: { name: 'asc' },
    // Catálogo acotado: un combo no necesita más que esto
    take: 500,
  });
}

/** `repairTypeId` del cliente: sólo se acepta si el tipo es de la empresa del operario. */
async function assertRepairTypeInCompany(repairTypeId: string, companyId: string): Promise<void> {
  const repairType = await prisma.types_of_repairs.findFirst({
    where: { id: repairTypeId, company_id: companyId },
    select: { id: true },
  });
  if (!repairType) throw new Error('El tipo de reparación no pertenece a la empresa del operario');
}

/**
 * Suma una tarea a la OT que el operario está trabajando.
 *
 * Crea el ítem del pedido, el ítem de la OT y la tarea en una sola transacción: si algo
 * falla, no quedan ítems huérfanos colgando del pedido.
 */
export async function addTaskToOwnWorkOrder(
  workOrderId: string,
  repairTypeId: string,
  description: string,
  isAutorizable: boolean
) {
  const { operator, workOrder } = await assertWorkOrderInScope(workOrderId);
  await assertRepairTypeInCompany(repairTypeId, operator.companyId);

  const workOrderItem = await prisma.work_order_items.findFirst({
    where: { work_order_id: workOrderId },
    select: { maintenance_order_items: { select: { maintenance_order_id: true } } },
  });

  const maintenanceOrderId = workOrderItem?.maintenance_order_items?.maintenance_order_id;
  if (!maintenanceOrderId) {
    throw new Error('No se encontró la orden de mantenimiento asociada a esta OT');
  }

  const repairStatus = isAutorizable ? 'pending_approval' : 'pending';

  const created = await withMaintenanceActor(operator.profileId, async (tx) => {
    const orderItem = await tx.maintenance_order_items.create({
      data: {
        maintenance_order_id: maintenanceOrderId,
        company_id: workOrder.company_id,
        repair_type_id: repairTypeId,
        description,
        is_diagnostico: false,
        assigned_sector_id: workOrder.sector_id,
        work_order_id: workOrderId,
      },
      select: { id: true },
    });

    const newWorkOrderItem = await tx.work_order_items.create({
      data: {
        work_order_id: workOrderId,
        maintenance_order_item_id: orderItem.id,
        status: 'pending',
      },
      select: { id: true },
    });

    await tx.work_order_item_repairs.create({
      data: {
        work_order_item_id: newWorkOrderItem.id,
        company_id: workOrder.company_id,
        repair_type_id: repairTypeId,
        status: repairStatus,
        is_operator_added: true,
        // `added_by` quedaba en NULL: la tarea agregada por el taller no tenía autor.
        added_by: operator.profileId,
      },
    });

    await logActivity(tx, {
      workOrderId,
      actionType: ACTIVITY_LOG.TASK_ADDED_BY_OPERATOR,
      performedBy: operator.profileId,
      metadata: { description, repairTypeId, isAutorizable },
    });

    return newWorkOrderItem;
  });

  logger.info('Tarea agregada a la OT propia', { data: { workOrderId, workOrderItemId: created.id } });

  revalidatePath('/operator');
  return { requiresApproval: isAutorizable };
}

/**
 * Pide trabajo para OTRO sector: crea un ítem suelto en el pedido, sin sector asignado, para
 * que el jefe de taller lo derive.
 *
 * El `maintenanceOrderId` llega del cliente: sólo se acepta si es un pedido en el que el
 * operario está trabajando (`assertMaintenanceOrderInScope`). La empresa del ítem sale del
 * operario, no del caller.
 */
export async function requestTaskForOtherSector(maintenanceOrderId: string, repairTypeId: string, description: string) {
  const operator = await assertMaintenanceOrderInScope(maintenanceOrderId);
  await assertRepairTypeInCompany(repairTypeId, operator.companyId);

  await withMaintenanceActor(operator.profileId, async (tx) => {
    await tx.maintenance_order_items.create({
      data: {
        maintenance_order_id: maintenanceOrderId,
        company_id: operator.companyId,
        repair_type_id: repairTypeId,
        description,
        is_diagnostico: false,
      },
    });

    await logActivity(tx, {
      maintenanceOrderId,
      actionType: ACTIVITY_LOG.TASK_REQUESTED_FOR_OTHER_SECTOR,
      performedBy: operator.profileId,
      metadata: { description, repairTypeId },
    });
  });

  revalidatePath('/operator');
}
