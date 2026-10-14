'use server';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { syncAllocatedTo } from '../lib/allocated-to';
import { resolveAssignmentChanges, type AssignmentChanges, type AssignmentUpdateResult } from '../lib/assignment-diff';

const logger = new Logger('features/Empresa/Clientes/assignments');

// Los tipos NO se re-exportan desde acá: en un archivo `'use server'` todo export se registra
// como server action, y un `export type { X }` deja una referencia a un nombre que ya no existe
// después de compilar. Se importan de `../lib/assignment-diff`.

/**
 * Afectaciones M:M cliente ↔ recurso (`contractor_employee` / `contractor_equipment`).
 *
 * IMPORTANTE: estas acciones NUNCA infieren bajas por ausencia. Se borra únicamente lo que
 * viene listado en `remove` y se inserta únicamente lo que viene en `add`. Enviar un conjunto
 * "final" y dejar que el servidor calcule la diferencia fue la causa del incidente de Vista
 * Oil (149 afectaciones borradas por una preselección vacía).
 *
 * Además de la pivote se sincroniza `employees.allocated_to` / `vehicles.allocated_to`
 * (regla del repo: la columna espejo se mantiene igual a la pivote) y se recalcula el
 * status documental cacheado del recurso (`refreshDocumentStatus`), porque los tipos de
 * documento pueden condicionarse a la afectación a un cliente.
 */

/** Valida que el cliente exista y pertenezca a la empresa activa. */
async function assertCustomerBelongsToCompany(customerId: string, companyId: string): Promise<void> {
  const customer = await prisma.customers.findFirst({
    where: { id: customerId, company_id: companyId },
    select: { id: true },
  });
  if (!customer) throw new Error('Cliente no encontrado');
}

async function requireActor(): Promise<string> {
  const actor = await getSessionUserId();
  if (!actor) throw new Error('Sesión requerida');
  return actor;
}

/**
 * Afectaciones vigentes de empleados para un cliente. Es la fuente de verdad para la
 * preselección del modal: se consulta directo contra la pivote, nunca contra el estado de la
 * pantalla (que puede estar a medio cargar).
 */
export async function getCustomerEmployeeAssignments(customerId: string): Promise<string[]> {
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.contractor_employee.findMany({
      where: { contractor_id: customerId, customers: { company_id: companyId } },
      select: { employee_id: true },
    });
    return rows.map((row) => row.employee_id).filter((id): id is string => Boolean(id));
  } catch (error) {
    logger.error('Error al obtener las afectaciones de empleados del cliente', { data: { error, customerId } });
    throw error;
  }
}

/** Afectaciones vigentes de equipos para un cliente. */
export async function getCustomerEquipmentAssignments(customerId: string): Promise<string[]> {
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.contractor_equipment.findMany({
      where: { contractor_id: customerId, customers: { company_id: companyId } },
      select: { equipment_id: true },
    });
    return rows.map((row) => row.equipment_id).filter((id): id is string => Boolean(id));
  } catch (error) {
    logger.error('Error al obtener las afectaciones de equipos del cliente', { data: { error, customerId } });
    throw error;
  }
}

/**
 * Aplica altas y bajas puntuales de empleados sobre un cliente.
 * Solo se borran los `remove` y solo se insertan los `add`; el resto queda intacto.
 */
export async function updateCustomerEmployeeAssignments(
  customerId: string,
  changes: AssignmentChanges
): Promise<AssignmentUpdateResult> {
  try {
    const { toAdd, toRemove } = resolveAssignmentChanges(changes);
    if (toAdd.length === 0 && toRemove.length === 0) {
      return { success: true, added: 0, removed: 0 };
    }

    const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);
    await assertCustomerBelongsToCompany(customerId, companyId);

    // Ids filtrados a la empresa ANTES de escribir: un id ajeno aborta toda la operación.
    const involvedIds = Array.from(new Set([...toAdd, ...toRemove]));
    const foundEmployees = await prisma.employees.findMany({
      where: { id: { in: involvedIds }, company_id: companyId },
      select: { id: true },
    });
    if (foundEmployees.length !== involvedIds.length) {
      throw new Error('Uno o más empleados no existen o no pertenecen a la empresa');
    }

    const { added, removed } = await withActor(
      actor,
      async (tx) => {
        let removedCount = 0;
        let addedCount = 0;

        if (toRemove.length > 0) {
          const result = await tx.contractor_employee.deleteMany({
            where: { contractor_id: customerId, employee_id: { in: toRemove } },
          });
          removedCount = result.count;
        }

        if (toAdd.length > 0) {
          const result = await tx.contractor_employee.createMany({
            data: toAdd.map((employeeId) => ({ contractor_id: customerId, employee_id: employeeId })),
            skipDuplicates: true,
          });
          addedCount = result.count;
        }

        await syncAllocatedTo(tx, 'employees', customerId, toAdd, toRemove);

        // Cache de status de los empleados afectados (altas Y bajas): un tipo puede condicionarse
        // a la afectacion a un cliente. Una sola sentencia para todos.
        await refreshDocumentStatus(tx, 'Persona', { ids: involvedIds, companyId });

        return { added: addedCount, removed: removedCount };
      },
      prisma,
      { timeout: 60_000 }
    );

    logger.info('Afectaciones de empleados actualizadas', {
      data: { customerId, added, removed, requestedAdd: toAdd.length, requestedRemove: toRemove.length },
    });

    return { success: true, added, removed };
  } catch (error) {
    logger.error('Error al actualizar las afectaciones de empleados', { data: { error, customerId, changes } });
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

/**
 * Aplica altas y bajas puntuales de equipos sobre un cliente.
 * Mismo criterio que empleados: solo se toca lo que viene explícitamente listado.
 */
export async function updateCustomerEquipmentAssignments(
  customerId: string,
  changes: AssignmentChanges
): Promise<AssignmentUpdateResult> {
  try {
    const { toAdd, toRemove } = resolveAssignmentChanges(changes);
    if (toAdd.length === 0 && toRemove.length === 0) {
      return { success: true, added: 0, removed: 0 };
    }

    const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);
    await assertCustomerBelongsToCompany(customerId, companyId);

    const involvedIds = Array.from(new Set([...toAdd, ...toRemove]));
    const foundEquipments = await prisma.vehicles.findMany({
      where: { id: { in: involvedIds }, company_id: companyId },
      select: { id: true },
    });
    if (foundEquipments.length !== involvedIds.length) {
      throw new Error('Uno o más equipos no existen o no pertenecen a la empresa');
    }

    const { added, removed } = await withActor(
      actor,
      async (tx) => {
        let removedCount = 0;
        let addedCount = 0;

        if (toRemove.length > 0) {
          const result = await tx.contractor_equipment.deleteMany({
            where: { contractor_id: customerId, equipment_id: { in: toRemove } },
          });
          removedCount = result.count;
        }

        if (toAdd.length > 0) {
          const result = await tx.contractor_equipment.createMany({
            data: toAdd.map((equipmentId) => ({ contractor_id: customerId, equipment_id: equipmentId })),
            skipDuplicates: true,
          });
          addedCount = result.count;
        }

        await syncAllocatedTo(tx, 'vehicles', customerId, toAdd, toRemove);

        // Cache de status de los equipos afectados (altas Y bajas), en una sola sentencia.
        await refreshDocumentStatus(tx, 'Equipos', { ids: involvedIds, companyId });

        return { added: addedCount, removed: removedCount };
      },
      prisma,
      { timeout: 60_000 }
    );

    logger.info('Afectaciones de equipos actualizadas', {
      data: { customerId, added, removed, requestedAdd: toAdd.length, requestedRemove: toRemove.length },
    });

    return { success: true, added, removed };
  } catch (error) {
    logger.error('Error al actualizar las afectaciones de equipos', { data: { error, customerId, changes } });
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
