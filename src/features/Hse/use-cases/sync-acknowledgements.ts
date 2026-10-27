import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

/**
 * Concilia quién tiene que aceptar qué documento HSE (y, si el alcance es un empleado o la empresa, qué capacitaciones le
 * aplican) (`hse_sync_acknowledgements`, prisma/sql/hse.sql): crea pendiente lo
 * que pasa a aplicar, desarchiva lo que vuelve a aplicar y ARCHIVA lo que dejó de aplicar (nunca borra respuestas).
 * Idempotente y en la MISMA transacción del cambio que la provoca.
 *
 * Puntos de enganche (todos los escritores de `company_position`, `hierarchical_position` e `is_active` de employees):
 * - alta de empleado y conversión de candidato en legajo (`createEmployeeCore`);
 * - edición del legajo (`updateEmployeeMutation`): puesto o sector;
 * - baja y reintegro (`toggleEmployeeStatus` en el legajo y `banCompanyUser`/`unbanCompanyUser` en Usuarios, que da de baja el legajo
 *   vinculado);
 * - reasignación masiva al borrar un puesto o sector (`reassignDependencies`): concilia la empresa entera;
 * - publicar, versionar o cambiar los destinatarios de un documento (acciones de HSE).
 *
 * Por qué acá y no en un trigger sobre `employees`: esa tabla ya tiene una cadena de triggers de documentos y alertas
 * (ver "Agregar o modificar un trigger" en CLAUDE.md) y un trigger más se dispararía en cada `updateMany` masivo. Las
 * escrituras de esas columnas son pocas y están todas listadas arriba; si se agrega otra, tiene que llamar a esto.
 *
 * La función es SECURITY DEFINER porque el usuario de RR.HH. que edita un legajo puede no tener permisos de HSE (la RLS
 * de las aceptaciones le rechazaría el INSERT y rompería la edición); ella misma exige que la empresa sea la del contexto.
 * Devuelve `void`: se llama con `$executeRaw`, nunca con `$queryRaw`.
 */
export async function syncHseAcknowledgements(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  scope: { companyId: string; documentId?: string | null; employeeId?: string | null }
): Promise<void> {
  await tx.$executeRaw`SELECT public.hse_sync_acknowledgements(${scope.companyId}::uuid, ${scope.documentId ?? null}::uuid, ${scope.employeeId ?? null}::uuid)`;
  // Sin documento puntual el cambio es del EMPLEADO (alta, puesto, sector, baja) o de la empresa entera: también
  // cambia qué capacitaciones le aplican. Así los puntos de enganche de Empleados cubren las dos cosas sin llamarse dos
  // veces (misma regla de destinatarios, `hse_employee_matches_target`).
  if (!scope.documentId) {
    await syncHseTrainingAssignments(tx, { companyId: scope.companyId, employeeId: scope.employeeId });
  }
}

/**
 * Concilia quién tiene que hacer cada capacitación publicada (`hse_sync_training_assignments`, prisma/sql/hse.sql):
 * crea pendiente lo que pasa a aplicar, desarchiva lo que vuelve a aplicar (con su resultado) y ARCHIVA lo que dejó de
 * aplicar (un aprobado queda como constancia). Idempotente, en la MISMA transacción del cambio. Devuelve `void`.
 */
export async function syncHseTrainingAssignments(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  scope: { companyId: string; trainingId?: string | null; employeeId?: string | null }
): Promise<void> {
  await tx.$executeRaw`SELECT public.hse_sync_training_assignments(${scope.companyId}::uuid, ${scope.trainingId ?? null}::uuid, ${scope.employeeId ?? null}::uuid)`;
}
