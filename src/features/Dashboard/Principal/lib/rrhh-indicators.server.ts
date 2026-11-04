import 'server-only';

import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import type { DiagramIndicatorResult, EmployeeIndicatorResult } from '@/features/Dashboard/Principal/actions/types';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { CANCELLED_ROW_STATUS, getOperationToday, getTodayParts } from './dashboard-dates';
import { aggregateDiagramIndicators } from './indicators';
import { positionFilter, sanitizePositionIds } from './position-filter';

/**
 * Indicadores de personal del tablero para una empresa: cuerpo de `getEmployeeIndicators` / `getDiagramIndicators` sin
 * la sesión (la web los llama tras validar permiso y empresa activa; la API móvil, con el contexto de su token). Corren
 * con el cliente contextual: el llamador fija el contexto de la empresa. Lanzan si no se puede calcular.
 */

/** Indicador de uso de personal: operativos (con diagrama de trabajo hoy) vs. usados en el parte. */
export async function computeEmployeeIndicators(
  companyId: string,
  positionIds?: string[]
): Promise<EmployeeIndicatorResult> {
  const { day, month, year } = getTodayParts();
  const todayDate = getOperationToday();
  const positions = sanitizePositionIds(positionIds);

  const [operativeDiagrams, reportRelations] = await Promise.all([
    prisma.employees_diagram.findMany({
      where: {
        day,
        month,
        year,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { work_active: true, is_active: true },
        employees: withCompany({ is_active: true, ...positionFilter(positions) }, companyId),
      },
      select: { employee_id: true },
      distinct: ['employee_id'],
    }),
    // Todas las filas de hoy con su estado: las canceladas no ponen al empleado en operación,
    // pero se informan aparte (quién quedó afuera por una cancelación).
    prisma.dailyreportemployeerelations.findMany({
      where: {
        employee_id: { not: null },
        dailyreportrows: {
          dailyreport: { date: new Date(todayDate), is_active: true, company_id: companyId },
        },
        employees: { is_active: true, ...positionFilter(positions) },
      },
      select: { employee_id: true, dailyreportrows: { select: { status: true } } },
    }),
  ]);

  const usedIds = new Set<string>();
  const inCancelledIds = new Set<string>();
  for (const relation of reportRelations) {
    if (!relation.employee_id) continue;
    if (relation.dailyreportrows?.status === CANCELLED_ROW_STATUS) inCancelledIds.add(relation.employee_id);
    else usedIds.add(relation.employee_id);
  }

  const employeesOperativos = operativeDiagrams.length;
  const employeesUsed = usedIds.size;
  const employeesCancelled = [...inCancelledIds].filter((id) => !usedIds.has(id)).length;
  // Disponibles = con diagrama de trabajo hoy y fuera del parte (diferencia de conjuntos, la misma
  // que lista el diálogo). Restar los dos conteos daba negativo cuando había gente en el parte sin
  // diagrama de trabajo: se descontaba a quien nunca estuvo en "con diagrama".
  const employeesAvailable = operativeDiagrams.filter((row) => !usedIds.has(row.employee_id)).length;

  return {
    employees_operativos: employeesOperativos,
    employees_used: employeesUsed,
    employees_available: employeesAvailable,
    employees_cancelled: employeesCancelled,
    indicator: percentageOrNull(employeesUsed, employeesOperativos),
  };
}

/** Cantidad de empleados por tipo de diagrama para el día de hoy. */
export async function computeDiagramIndicators(
  companyId: string,
  positionIds?: string[]
): Promise<DiagramIndicatorResult[]> {
  const { day, month, year } = getTodayParts();
  const positions = sanitizePositionIds(positionIds);
  const employeesWhere = withCompany({ is_active: true, ...positionFilter(positions) }, companyId);

  const [diagrams, totalActiveEmployees] = await Promise.all([
    prisma.employees_diagram.findMany({
      where: {
        day,
        month,
        year,
        employees: employeesWhere,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { is_active: true },
      },
      select: {
        employee_id: true,
        diagram_type: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { select: { name: true, color: true } },
      },
    }),
    prisma.employees.count({ where: employeesWhere }),
  ]);

  return aggregateDiagramIndicators(diagrams, totalActiveEmployees);
}
