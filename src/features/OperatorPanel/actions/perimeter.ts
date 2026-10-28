import 'server-only';

import { ModuleDisabledError, isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId, isSessionAnonymous } from '@/shared/lib/session';
import { cache } from 'react';

/**
 * Perímetro del panel del operario.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público, y acá el perímetro NO es
 * sólo la empresa: es el **sector de taller asignado al operario**. Casi todas las actions
 * reciben del cliente un `sectorId`, un `workOrderId` o un `repairId`; sin estas guardas, un
 * id de otro sector — o de otra empresa — entraba derecho, porque la consulta usaba el id
 * tal cual venía.
 *
 * Todo sale de la sesión: el usuario → `profile` → `employees` → sectores asignados
 * (`employee_workshop_sectors`). Lo que manda el cliente sólo se acepta si cae dentro de eso.
 *
 * Módulo server-only (NO son Server Actions).
 */

export interface OperatorAssignedSector {
  sectorId: string;
  sectorName: string;
  workshopId: string;
  workshopName: string;
}

export interface OperatorIdentity {
  /**
   * `profile.id` — destino de las FKs `*_by` (`started_by`, `completed_by`,
   * `maintenance_activity_log.performed_by`) y actor de los triggers de auditoría.
   * NO es el id de sesión (`credential_id`).
   */
  profileId: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  sectors: OperatorAssignedSector[];
  /** Los mismos sectores, para los `where` por id. */
  sectorIds: string[];
}

/**
 * Sectores de taller asignados al empleado (M:N), acotados a su empresa.
 *
 * Exportada porque el login la necesita antes de que exista sesión de operario, cuando
 * `getOperatorIdentity()` todavía no puede resolver nada.
 *
 * El filtro por `company_id` es redundante con el modelo de datos pero barato: si una
 * asignación quedara apuntando a un sector de otra empresa, no ampliaría el perímetro.
 */
export async function getAssignedSectorsForEmployee(
  employeeId: string,
  companyId: string
): Promise<OperatorAssignedSector[]> {
  const rows = await prisma.employee_workshop_sectors.findMany({
    where: {
      employee_id: employeeId,
      workshop_sectors: { is_active: true, company_id: companyId },
    },
    select: {
      workshop_sectors: {
        select: {
          id: true,
          name: true,
          workshop_id: true,
          workshops: { select: { name: true } },
        },
      },
    },
    orderBy: { workshop_sectors: { name: 'asc' } },
  });

  return rows.map((row) => ({
    sectorId: row.workshop_sectors.id,
    sectorName: row.workshop_sectors.name,
    workshopId: row.workshop_sectors.workshop_id,
    workshopName: row.workshop_sectors.workshops.name,
  }));
}

/**
 * Identidad del operario de la sesión, o `null` si la sesión no llega a serlo (sin usuario,
 * sin profile, sin empleado vinculado o sin sectores asignados).
 *
 * Memoizada por request con React `cache()`: varias actions del mismo request no repiten
 * las cuatro consultas.
 */
export const getOperatorIdentity = cache(async (): Promise<OperatorIdentity | null> => {
  const credentialId = await getSessionUserId();
  if (!credentialId) return null;

  // La sesión ANÓNIMA del QR de mantenimiento también tiene un profile con `employee_id`
  // (ver `completeMaintenanceEmployeeAnonymousSession`), pero no es un usuario: a este panel
  // se entra con email y contraseña. Sin este corte, escanear un QR y tipear un CUIL abriría
  // el panel del taller.
  if (await isSessionAnonymous()) return null;

  const profile = await prisma.profile.findUnique({
    where: { credential_id: credentialId },
    select: { id: true, employee_id: true },
  });
  if (!profile?.employee_id) return null;

  const employee = await prisma.employees.findUnique({
    where: { id: profile.employee_id },
    select: { id: true, firstname: true, lastname: true, company_id: true },
  });
  if (!employee?.company_id) return null;

  const sectors = await getAssignedSectorsForEmployee(employee.id, employee.company_id);
  if (sectors.length === 0) return null;

  return {
    profileId: profile.id,
    employeeId: employee.id,
    employeeName: `${employee.firstname} ${employee.lastname}`.trim(),
    companyId: employee.company_id,
    sectors,
    sectorIds: sectors.map((sector) => sector.sectorId),
  };
});

/** Ídem, pero lanza: lo usan las mutaciones, que siempre requieren un operario. */
export async function requireOperatorIdentity(): Promise<OperatorIdentity> {
  const operator = await getOperatorIdentity();
  if (!operator) throw new Error('No hay una sesión de operario con sectores de taller asignados');
  // Módulo `mantenimiento` apagado para la empresa del operario (F3.3): el panel no opera (este perímetro no pasa por permisos).
  if (!(await isModuleEnabledForCompany('mantenimiento', operator.companyId)))
    throw new ModuleDisabledError('mantenimiento');
  return operator;
}

/** `sectorId` del cliente: sólo se acepta si está entre los sectores asignados al operario. */
export async function assertAssignedSector(sectorId: string): Promise<OperatorIdentity> {
  const operator = await requireOperatorIdentity();
  if (!operator.sectorIds.includes(sectorId)) {
    throw new Error('El sector no está asignado al operario');
  }
  return operator;
}

export interface OperatorWorkOrderScope {
  operator: OperatorIdentity;
  workOrder: { id: string; status: string; sector_id: string | null; company_id: string };
}

/**
 * `workOrderId` del cliente: sólo se acepta si la OT es de la empresa del operario Y de uno
 * de sus sectores asignados. Devuelve el estado actual, que las actions necesitan igual para
 * validar la transición y registrar el historial.
 */
export async function assertWorkOrderInScope(workOrderId: string): Promise<OperatorWorkOrderScope> {
  const operator = await requireOperatorIdentity();

  const workOrder = await prisma.work_orders.findFirst({
    where: {
      id: workOrderId,
      company_id: operator.companyId,
      sector_id: { in: operator.sectorIds },
    },
    select: { id: true, status: true, sector_id: true, company_id: true },
  });

  if (!workOrder) throw new Error('La orden de trabajo no pertenece a un sector asignado al operario');

  return { operator, workOrder };
}

export interface OperatorRepairScope {
  operator: OperatorIdentity;
  repair: {
    id: string;
    status: string;
    work_order_id: string;
    work_order_status: string;
    /** Nombre del tipo de reparación: lo usan las cuatro actions para el historial. */
    repair_type_name: string;
  };
}

/**
 * `repairId` del cliente: se resuelve la OT a la que cuelga y se valida contra el perímetro.
 *
 * Es la guarda que faltaba en `completeRepair`, `uncompleteRepair`, `updateTechnicianNotes` y
 * `returnTask`: escribían por id sin mirar de quién era la tarea.
 */
export async function assertRepairInScope(repairId: string): Promise<OperatorRepairScope> {
  const operator = await requireOperatorIdentity();

  const repair = await prisma.work_order_item_repairs.findFirst({
    where: {
      id: repairId,
      company_id: operator.companyId,
      work_order_items: {
        work_orders: {
          company_id: operator.companyId,
          sector_id: { in: operator.sectorIds },
        },
      },
    },
    select: {
      id: true,
      status: true,
      types_of_repairs: { select: { name: true } },
      work_order_items: { select: { work_order_id: true, work_orders: { select: { status: true } } } },
    },
  });

  if (!repair) throw new Error('La tarea no pertenece a un sector asignado al operario');

  return {
    operator,
    repair: {
      id: repair.id,
      status: repair.status,
      work_order_id: repair.work_order_items.work_order_id,
      work_order_status: repair.work_order_items.work_orders.status,
      repair_type_name: repair.types_of_repairs.name,
    },
  };
}

/**
 * `maintenanceOrderId` del cliente: sólo se acepta si el pedido es de la empresa del operario
 * y tiene al menos un ítem asignado a uno de sus sectores — o sea, si el operario realmente
 * está trabajando en ese pedido.
 *
 * Lo pide `requestTaskForOtherSector`, que hasta ahora creaba ítems en cualquier pedido cuyo
 * id se conociera.
 */
export async function assertMaintenanceOrderInScope(maintenanceOrderId: string): Promise<OperatorIdentity> {
  const operator = await requireOperatorIdentity();

  const order = await prisma.maintenance_orders.findFirst({
    where: {
      id: maintenanceOrderId,
      company_id: operator.companyId,
      maintenance_order_items: {
        some: {
          OR: [
            { assigned_sector_id: { in: operator.sectorIds } },
            { work_orders: { sector_id: { in: operator.sectorIds } } },
          ],
        },
      },
    },
    select: { id: true },
  });

  if (!order) throw new Error('El pedido de mantenimiento no está a cargo de un sector asignado al operario');

  return operator;
}
