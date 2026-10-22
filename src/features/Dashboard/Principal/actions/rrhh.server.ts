'use server';

import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { CANCELLED_ROW_STATUS, getOperationToday, getTodayParts } from '../lib/dashboard-dates';
import { aggregateDiagramIndicators } from '../lib/indicators';
import { positionFilter, sanitizePositionIds } from '../lib/position-filter';
import type { DiagramIndicatorResult, EmployeeIndicatorResult } from './types';

const logger = new Logger('features/Dashboard/Principal/rrhh');

/**
 * Personal del dashboard principal: indicador de uso y distribución por diagrama.
 *
 * Perímetro: la empresa sale de `getActiveCompanyId()`. Los `positionIds` que manda el
 * cliente sólo acotan el listado y se sanean antes de entrar al SQL — ver
 * `lib/position-filter`, que además deja el filtro fallando CERRADO.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────────────────────

/** Indicador de uso de personal: operativos (con diagrama de trabajo hoy) vs. usados en el parte. */
export async function getEmployeeIndicators(positionIds?: string[]): Promise<EmployeeIndicatorResult> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo indicadores de empleados', { data: { positionIds } });

  try {
    const companyId = await getActiveCompanyId();
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
  } catch (error) {
    logger.error('Error al obtener indicadores de empleados', { data: { error } });
    // Sin dato no hay 0: un indicador en 0 % se leería como "nadie está en operación".
    throw error;
  }
}

/** Cantidad de empleados por tipo de diagrama para el día de hoy. */
export async function getDiagramIndicators(positionIds?: string[]): Promise<DiagramIndicatorResult[]> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo indicadores de diagramas', { data: { positionIds } });

  try {
    const companyId = await getActiveCompanyId();
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
  } catch (error) {
    logger.error('Error al obtener indicadores de diagramas', { data: { error } });
    throw error;
  }
}

/**
 * Puestos de la empresa activa, para el filtro del tablero.
 *
 * Perímetro: `company_positions` tiene `company_id`; antes se devolvían los puestos de
 * TODAS las empresas, que además son los valores que el filtro manda de vuelta.
 */
export async function getAllPositions() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo todas las posiciones');

  try {
    const companyId = await getActiveCompanyId();

    return await prisma.company_positions.findMany({
      where: withCompany({}, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener posiciones', { data: { error } });
    throw error;
  }
}
