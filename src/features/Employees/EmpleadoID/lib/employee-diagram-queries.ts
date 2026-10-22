import 'server-only';

import { canViewServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/EmpleadoID/diagrams');

/**
 * Obtiene el historial de cambios de diagramas de un empleado.
 * Incluye el perfil del usuario que realizó la modificación.
 */
export async function getEmployeeDiagramHistory(employeeId: string) {
  logger.debug('Obteniendo historial de diagramas del empleado', { data: { employeeId } });
  if (!(await canViewServer('empleados', 'employees'))) return [];
  try {
    return await prisma.diagrams_logs.findMany({
      where: { employee_id: employeeId, employees: { company_id: await getActiveCompanyId() } },
      select: {
        id: true,
        created_at: true,
        prev_date: true,
        description: true,
        state: true,
        prev_state: true,
        profile: {
          select: { fullname: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  } catch (error) {
    logger.error('Error al obtener historial de diagramas del empleado', { data: { error, employeeId } });
    return [];
  }
}

/**
 * Obtiene los diagramas asignados a un empleado con el tipo de diagrama incluido.
 */
export async function getEmployeeDiagrams(employeeId: string) {
  logger.debug('Obteniendo diagramas del empleado', { data: { employeeId } });
  if (!(await canViewServer('empleados', 'employees'))) return [];
  try {
    return await prisma.employees_diagram.findMany({
      where: { employee_id: employeeId, employees: { company_id: await getActiveCompanyId() } },
      select: {
        id: true,
        created_at: true,
        employee_id: true,
        day: true,
        month: true,
        year: true,
        is_active: true,
        comments: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: {
          select: {
            id: true,
            name: true,
            color: true,
            company_id: true,
            created_at: true,
            short_description: true,
          },
        },
      },
    });
  } catch (error) {
    logger.error('Error al obtener diagramas del empleado', { data: { error, employeeId } });
    return [];
  }
}
