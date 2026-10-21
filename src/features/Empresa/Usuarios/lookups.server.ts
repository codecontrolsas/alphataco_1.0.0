'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { employeeIdsLinkedToUsers } from '@/shared/lib/employee-profile';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/** Selectores auxiliares de la tab Usuarios (roles disponibles y buscador de legajos para vincular). */
const logger = new Logger('Empresa/Usuarios/lookups');

/** Estos selectores alimentan acciones de gestión de usuarios: exigen `usuarios-empleados:update`. */
async function assertCanManageUsers(): Promise<void> {
  if (!(await checkPermissionServer('configuracion', 'usuarios-empleados', 'update'))) {
    throw new Error('No tenés permiso para realizar esta acción');
  }
}

// ── Buscar empleados para vincular ────────────────────────────────────────────
/** Lanza error si no hay permiso (nunca devuelve `[]` por denegación: se leería como "sin resultados"). */
export async function searchEmployeesForLink(query: string) {
  await assertCanManageUsers();
  if (!query || query.length < 2) return [];
  const companyId = await getActiveCompanyId();

  try {
    // Legajos ya vinculados a un USUARIO. Los profiles de las sesiones anónimas del QR también
    // llevan `employee_id`, y contarlos sacaba del buscador a todo empleado que alguna vez
    // escaneó un QR.
    const linkedEmployeeIds = await employeeIdsLinkedToUsers();

    return await prisma.employees.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        ...(linkedEmployeeIds.length > 0 ? { id: { notIn: linkedEmployeeIds } } : {}),
        OR: [
          { firstname: { contains: query, mode: 'insensitive' } },
          { lastname: { contains: query, mode: 'insensitive' } },
          { cuil: { contains: query, mode: 'insensitive' } },
          { file: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstname: true, lastname: true, cuil: true, file: true, picture: true },
      orderBy: { lastname: 'asc' },
      take: 20,
    });
  } catch (error) {
    logger.error('Error buscando empleados para vincular', { data: { error } });
    return [];
  }
}
