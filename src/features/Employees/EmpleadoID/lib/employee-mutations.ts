import 'server-only';

import { refreshResourceStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  employeeFormSchema,
  employeeUpdateSchema,
  type EmployeeFormData,
  type EmployeeUpdateData,
  type RelationChanges,
} from '../schemas/employee-schema';
import { createEmployeeCore } from './create-employee-core';
import {
  assertEmployeeRefsAllowed,
  buildEmployeeScalars,
  parseAdmissionDate,
  parseOrThrow,
  rethrowEmployeeWriteError,
} from './employee-write';

const logger = new Logger('features/EmpleadoID/mutations');

/** Resultado de aplicar los deltas de las M:M al editar (cantidades REALMENTE agregadas y quitadas). */
export interface RelationChangeCounts {
  allocations: number;
  aptitudes: number;
  workshopSectors: number;
}

function normalizeChanges(changes: RelationChanges | undefined): RelationChanges {
  const add = [...new Set(changes?.add ?? [])];
  const remove = [...new Set(changes?.remove ?? [])];
  if (add.some((id) => remove.includes(id)))
    throw new Error('Un mismo elemento no puede agregarse y quitarse a la vez');
  return { add, remove };
}

async function requireEmployeePermission(action: 'create' | 'update'): Promise<void> {
  const allowed = await checkPermissionServer('empleados', 'employees', action);
  if (!allowed) {
    throw new Error(
      action === 'create' ? 'No tenés permiso para crear empleados' : 'No tenés permiso para editar empleados'
    );
  }
}

/**
 * Crea un nuevo empleado junto con sus relaciones M:M (afectaciones, aptitudes y sectores).
 * La empresa sale de la sesión activa, nunca del payload. Usa una transacción con el actor seteado.
 */
export async function createEmployeeMutation(input: EmployeeFormData) {
  await requireEmployeePermission('create');
  const data = parseOrThrow(employeeFormSchema, input);
  logger.debug('Creando empleado', { data: { firstname: data.firstname, lastname: data.lastname } });

  const [company_id, actor] = await Promise.all([getActiveCompanyId(), getSessionUserId()]);
  if (!actor) throw new Error('Sesión requerida');

  try {
    // La creacion vive en createEmployeeCore para que la comparta la conversion de un
    // candidato en legajo (ticket 505) y ambos flujos creen al empleado igual.
    // withActor: los triggers de documentos/alertas leen app.user_id.
    const employee = await withActor(actor, (tx) => createEmployeeCore(tx, data, company_id));

    logger.info('Empleado creado exitosamente', { data: { employeeId: employee.id } });
    revalidatePath('/dashboard/employee/action');
    revalidatePath('/dashboard/employee');
    return employee;
  } catch (error) {
    logger.error('Error al crear empleado', { data: { error } });
    throw error;
  }
}

/** Aplica los deltas de afectaciones a clientes y mantiene el array denormalizado `allocated_to`. */
async function applyContractorChanges(tx: Prisma.TransactionClient, employeeId: string, changes: RelationChanges) {
  let removed = 0;
  let added = 0;
  if (changes.remove.length > 0) {
    ({ count: removed } = await tx.contractor_employee.deleteMany({
      where: { employee_id: employeeId, contractor_id: { in: changes.remove } },
    }));
  }
  if (changes.add.length > 0) {
    ({ count: added } = await tx.contractor_employee.createMany({
      data: changes.add.map((contractorId) => ({ employee_id: employeeId, contractor_id: contractorId })),
      skipDuplicates: true,
    }));
  }
  if (removed > 0 || added > 0) {
    const current = await tx.contractor_employee.findMany({
      where: { employee_id: employeeId },
      select: { contractor_id: true },
    });
    await tx.employees.update({
      where: { id: employeeId },
      data: { allocated_to: current.map((row) => row.contractor_id).filter((id): id is string => id !== null) },
      select: { id: true },
    });
  }
  return { added, removed };
}

/** Aplica los deltas de aptitudes técnicas (no tienen unique: se agrega solo lo que falta). */
async function applyAptitudeChanges(tx: Prisma.TransactionClient, employeeId: string, changes: RelationChanges) {
  let removed = 0;
  let added = 0;
  if (changes.remove.length > 0) {
    ({ count: removed } = await tx.empleado_aptitudes.deleteMany({
      where: { empleado_id: employeeId, aptitud_id: { in: changes.remove } },
    }));
  }
  if (changes.add.length > 0) {
    const existing = await tx.empleado_aptitudes.findMany({
      where: { empleado_id: employeeId, aptitud_id: { in: changes.add } },
      select: { aptitud_id: true },
    });
    const present = new Set(existing.map((row) => row.aptitud_id));
    const missing = changes.add.filter((id) => !present.has(id));
    if (missing.length > 0) {
      ({ count: added } = await tx.empleado_aptitudes.createMany({
        data: missing.map((aptitudId) => ({ empleado_id: employeeId, aptitud_id: aptitudId })),
      }));
    }
  }
  return { added, removed };
}

/** Aplica los deltas de sectores de taller. */
async function applyWorkshopSectorChanges(tx: Prisma.TransactionClient, employeeId: string, changes: RelationChanges) {
  let removed = 0;
  let added = 0;
  if (changes.remove.length > 0) {
    ({ count: removed } = await tx.employee_workshop_sectors.deleteMany({
      where: { employee_id: employeeId, workshop_sector_id: { in: changes.remove } },
    }));
  }
  if (changes.add.length > 0) {
    ({ count: added } = await tx.employee_workshop_sectors.createMany({
      data: changes.add.map((sectorId) => ({ employee_id: employeeId, workshop_sector_id: sectorId })),
      skipDuplicates: true,
    }));
  }
  return { added, removed };
}

/**
 * Actualiza un empleado existente. Las M:M (afectaciones, aptitudes, sectores de taller) se
 * modifican SOLO con los deltas `{ add, remove }` que manda el cliente: nunca se reemplaza el
 * conjunto completo, así una afectación hecha desde otra pantalla mientras el formulario estaba
 * abierto no se pierde al guardar. `allocated_to` / `aptitudes` / `workshop_sector_ids` se ignoran.
 */
export async function updateEmployeeMutation(employeeId: string, input: EmployeeUpdateData) {
  await requireEmployeePermission('update');
  const data = parseOrThrow(employeeUpdateSchema, input);
  logger.debug('Actualizando empleado', { data: { employeeId } });

  const [company_id, actor] = await Promise.all([getActiveCompanyId(), getSessionUserId()]);
  if (!actor) throw new Error('Sesión requerida');

  const allocation = normalizeChanges(data.allocation_changes);
  const aptitude = normalizeChanges(data.aptitude_changes);
  const workshopSector = normalizeChanges(data.workshop_sector_changes);
  const admissionDate = parseAdmissionDate(data.date_of_admission);

  try {
    const result = await withActor(actor, async (tx) => {
      // Sólo se validan los ids que se AGREGAN: los que se quitan se acotan por empleado en el DELETE.
      await assertEmployeeRefsAllowed(tx, company_id, {
        data,
        contractorIds: allocation.add,
        aptitudeIds: aptitude.add,
        workshopSectorIds: workshopSector.add,
      });

      // Campos escalares (sólo si el legajo es de la empresa activa). `company_id`, `status`,
      // `is_active` y compañía NO se tocan acá: no están en el armado explícito.
      const updated = await tx.employees.update({
        where: { id: employeeId, company_id },
        data: { ...buildEmployeeScalars(data), date_of_admission: admissionDate },
        select: { id: true },
      });

      const allocations = await applyContractorChanges(tx, employeeId, allocation);
      const aptitudes = await applyAptitudeChanges(tx, employeeId, aptitude);
      const workshopSectors = await applyWorkshopSectorChanges(tx, employeeId, workshopSector);

      // Cache de status: se recalcula con el estado FINAL del empleado (las M:M cambian
      // despues del update escalar). Va ultimo para que su valor sea el que queda en la transaccion.
      await refreshResourceStatus(tx, 'Persona', company_id, employeeId);

      return {
        id: updated.id,
        added: {
          allocations: allocations.added,
          aptitudes: aptitudes.added,
          workshopSectors: workshopSectors.added,
        } satisfies RelationChangeCounts,
        removed: {
          allocations: allocations.removed,
          aptitudes: aptitudes.removed,
          workshopSectors: workshopSectors.removed,
        } satisfies RelationChangeCounts,
      };
    });

    logger.info('Empleado actualizado exitosamente', {
      data: { employeeId: result.id, added: result.added, removed: result.removed },
    });
    revalidatePath('/dashboard/employee/action');
    revalidatePath('/dashboard/employee');
    return result;
  } catch (error) {
    logger.error('Error al actualizar empleado', { data: { error, employeeId } });
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      throw new Error('Empleado no encontrado en la empresa activa');
    }
    return rethrowEmployeeWriteError(error);
  }
}
