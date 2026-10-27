import { refreshResourceStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { syncHseAcknowledgements } from '@/features/Hse/use-cases/sync-acknowledgements';
import type { Prisma } from '@/generated/prisma/client';
import type { EmployeeFormData } from '../schemas/employee-schema';
import {
  admissionDateForCreate,
  assertEmployeeRefsAllowed,
  buildEmployeeScalars,
  rethrowEmployeeWriteError,
} from './employee-write';

/**
 * Crea un empleado con sus relaciones M:M y dispara el recalculo de documentos.
 *
 * Vive fuera de `actions.server.ts` (que es un modulo `'use server'`) porque recibe el
 * cliente transaccional de Prisma: los argumentos de una server action deben ser
 * serializables, y `tx` no lo es.
 *
 * La comparten dos flujos: el alta normal de empleado (`createEmployee`) y la conversion
 * de un candidato en legajo (`approvePreEmployee`, ticket 505). Asi ambos caminos crean
 * al empleado exactamente igual.
 *
 * NO chequea permisos de rol: cada flujo tiene el suyo (alta de empleado vs. aprobar candidato).
 * Tampoco confia en `data` aunque venga parseado: arma los datos campo por campo, valida que los
 * ids de catálogo sean de la empresa y toma `company_id` del argumento, nunca del payload.
 */
export async function createEmployeeCore(
  tx: Prisma.TransactionClient,
  data: EmployeeFormData,
  companyId: string
): Promise<{ id: string }> {
  const scalars = buildEmployeeScalars(data);
  const contractorIds = [...new Set(data.allocated_to ?? [])];
  const aptitudeIds = [...new Set(data.aptitudes ?? [])];
  const workshopSectorIds = [...new Set(data.workshop_sector_ids ?? [])];

  await assertEmployeeRefsAllowed(tx, companyId, { data, contractorIds, aptitudeIds, workshopSectorIds });

  try {
    const created = await tx.employees.create({
      data: {
        ...scalars,
        company_id: companyId,
        // date_of_admission es NOT NULL en BD; sin valor en el formulario se usa hoy (hora argentina).
        date_of_admission: admissionDateForCreate(data.date_of_admission),
        // allocated_to es un array denormalizado en BD; se mantiene en sincronía
        // con la tabla pivot contractor_employee que es la fuente de verdad para M:M
        allocated_to: contractorIds,
      },
      select: { id: true },
    });

    if (contractorIds.length > 0) {
      await tx.contractor_employee.createMany({
        data: contractorIds.map((contractorId) => ({ employee_id: created.id, contractor_id: contractorId })),
        skipDuplicates: true,
      });
    }

    if (aptitudeIds.length > 0) {
      await tx.empleado_aptitudes.createMany({
        data: aptitudeIds.map((aptitudId) => ({ empleado_id: created.id, aptitud_id: aptitudId })),
        skipDuplicates: true,
      });
    }

    if (workshopSectorIds.length > 0) {
      await tx.employee_workshop_sectors.createMany({
        data: workshopSectorIds.map((sectorId) => ({ employee_id: created.id, workshop_sector_id: sectorId })),
        skipDuplicates: true,
      });
    }

    // Cache de status con el estado FINAL: contratistas/aptitudes/sectores se insertan DESPUES del
    // INSERT escalar. Va ultimo para que su valor sea el que queda en la transaccion.
    await refreshResourceStatus(tx, 'Persona', companyId, created.id);
    // Documentos HSE ya publicados que le aplican por puesto, sector o a todos: quedan pendientes de aceptar.
    await syncHseAcknowledgements(tx, { companyId, employeeId: created.id });

    return created;
  } catch (error) {
    // Dentro de la transacción: relanzar revierte todo y el usuario ve un mensaje claro.
    return rethrowEmployeeWriteError(error);
  }
}
