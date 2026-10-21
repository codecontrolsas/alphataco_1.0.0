'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';

import { assertDiagramAccess } from '../lib/diagram-access';
import { buildDiagramDayRangeWhere, toDiagramDay } from '../lib/diagram-dates';
import { uuidLike } from '../lib/diagram-ids';
import { INDIVIDUAL_MAX_TOTAL_DAYS, MASSIVE_MAX_RANGES } from '../lib/massive-limits';
import { findRangesIssue } from '../lib/massive-ranges';
import { formatEmployeeLabel } from './lib/employee-label';

const logger = new Logger('features/Employees/Diagrams/load');

/** Resultados por página del buscador de empleados. */
const EMPLOYEE_PAGE_SIZE = 50;

// ─── Catálogos de la carga masiva ───────────────────────────────────────────

/**
 * Catálogos de la carga masiva en UNA llamada: diagramas de trabajo activos (con su novedad de días inactivos y las
 * de días activos, en orden de alta) y novedades activas. Reemplaza a las tres consultas que se hacían al montar.
 */
export async function getMassiveLoadCatalogs() {
  await assertDiagramAccess('massive_diagram');
  const companyId = await getActiveCompanyId();

  try {
    const [workDiagrams, diagramTypes] = await Promise.all([
      prisma.work_diagram.findMany({
        where: withCompany({ is_active: true }, companyId),
        select: {
          id: true,
          name: true,
          active_working_days: true,
          inactive_working_days: true,
          diagram_type: { select: { id: true, name: true, color: true } },
          work_diagram_active_novelties: {
            select: { diagram_type: { select: { id: true, name: true, color: true } } },
            orderBy: { created_at: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.diagram_type.findMany({
        where: withCompany({ is_active: true }, companyId),
        select: { id: true, name: true, color: true, short_description: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      workDiagrams: workDiagrams.map((workDiagram) => ({
        id: workDiagram.id,
        name: workDiagram.name,
        activeDays: workDiagram.active_working_days ? Number(workDiagram.active_working_days) : null,
        inactiveDays: workDiagram.inactive_working_days ? Number(workDiagram.inactive_working_days) : null,
        inactiveNovelty: workDiagram.diagram_type,
        activeNovelties: workDiagram.work_diagram_active_novelties.map((item) => item.diagram_type),
      })),
      diagramTypes,
    };
  } catch (error) {
    logger.error('Error al obtener los catálogos de la carga masiva', { data: { error } });
    throw error;
  }
}

// ─── Buscador de empleados ──────────────────────────────────────────────────

const employeeSearchSchema = z.object({
  search: z.string().max(80).optional(),
  workflows: z.array(uuidLike).max(50).optional(),
  positions: z.array(uuidLike).max(50).optional(),
  costCenters: z.array(uuidLike).max(50).optional(),
  covenants: z.array(uuidLike).max(50).optional(),
  guilds: z.array(uuidLike).max(50).optional(),
  categories: z.array(uuidLike).max(50).optional(),
  contractors: z.array(uuidLike).max(50).optional(),
  page: z.number().int().min(1).max(1000),
});

export type EmployeeSearchInput = z.input<typeof employeeSearchSchema>;

/**
 * Empleados activos de la empresa para el selector de las cargas: sólo lo que muestra la lista (id, nombre, apellido,
 * legajo), con búsqueda por legajo/apellido/nombre (cada palabra debe aparecer en alguno) y los filtros del selector.
 * Pide una fila de más para saber si hay otra página sin hacer un `count`.
 */
export async function searchLoadEmployees(input: EmployeeSearchInput) {
  await assertDiagramAccess('new', 'massive_diagram');
  const companyId = await getActiveCompanyId();
  const params = employeeSearchSchema.parse(input);

  const tokens = (params.search ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.employeesWhereInput = {
    is_active: true,
    company_id: companyId,
    ...(tokens.length > 0
      ? {
          AND: tokens.map((token) => ({
            OR: [
              { file: { contains: token, mode: 'insensitive' as const } },
              { lastname: { contains: token, mode: 'insensitive' as const } },
              { firstname: { contains: token, mode: 'insensitive' as const } },
            ],
          })),
        }
      : {}),
    ...(params.workflows?.length ? { workflow_diagram: { in: params.workflows } } : {}),
    ...(params.positions?.length ? { company_position: { in: params.positions } } : {}),
    ...(params.costCenters?.length ? { cost_center_id: { in: params.costCenters } } : {}),
    ...(params.covenants?.length ? { covenants_id: { in: params.covenants } } : {}),
    ...(params.guilds?.length ? { guild_id: { in: params.guilds } } : {}),
    ...(params.categories?.length ? { category_id: { in: params.categories } } : {}),
    ...(params.contractors?.length
      ? { contractor_employee: { some: { contractor_id: { in: params.contractors } } } }
      : {}),
  };

  try {
    const rows = await prisma.employees.findMany({
      where,
      select: { id: true, firstname: true, lastname: true, file: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
      skip: (params.page - 1) * EMPLOYEE_PAGE_SIZE,
      take: EMPLOYEE_PAGE_SIZE + 1,
    });

    return {
      page: params.page,
      hasMore: rows.length > EMPLOYEE_PAGE_SIZE,
      employees: rows.slice(0, EMPLOYEE_PAGE_SIZE).map((row) => ({ id: row.id, label: formatEmployeeLabel(row) })),
    };
  } catch (error) {
    logger.error('Error al buscar empleados para la carga', { data: { error } });
    throw error;
  }
}

/** Etiqueta (`[legajo] Apellido, Nombre`) de un empleado de la empresa activa: para el empleado fijo del detalle. */
export async function getLoadEmployee(employeeId: string) {
  await assertDiagramAccess('new', 'massive_diagram', 'employees');
  const id = uuidLike.parse(employeeId);
  const companyId = await getActiveCompanyId();

  try {
    const row = await prisma.employees.findFirst({
      where: withCompany({ id }, companyId),
      select: { id: true, firstname: true, lastname: true, file: true },
    });
    return row ? { id: row.id, label: formatEmployeeLabel(row) } : null;
  } catch (error) {
    logger.error('Error al obtener el empleado de la carga', { data: { error, employeeId } });
    throw error;
  }
}

/**
 * Opciones de los filtros del selector de empleados en UNA llamada (una consulta por catálogo, en paralelo). Se pide
 * recién cuando el usuario abre los filtros.
 */
export async function getLoadEmployeeFilterOptions() {
  await assertDiagramAccess('massive_diagram');
  const companyId = await getActiveCompanyId();
  const byCompany = {
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  } as const;

  try {
    const [positions, costCenters, covenants, guilds, categories, contractors] = await Promise.all([
      prisma.company_positions.findMany(byCompany),
      prisma.cost_center.findMany(byCompany),
      prisma.covenant.findMany(byCompany),
      prisma.guild.findMany(byCompany),
      // `category` no tiene `company_id`: cuelga del convenio, que sí es de una empresa.
      prisma.category.findMany({
        where: { is_active: true, covenant: { company_id: companyId } },
        select: { id: true, name: true, covenant: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.customers.findMany(byCompany),
    ]);

    const toOption = (item: { id: string; name: string | null }) => ({ value: item.id, label: item.name ?? item.id });
    return {
      positions: positions.map(toOption),
      costCenters: costCenters.map(toOption),
      covenants: covenants.map(toOption),
      guilds: guilds.map(toOption),
      categories: categories.map((item) => ({
        value: item.id,
        label: item.covenant?.name ? `${item.name ?? item.id} (${item.covenant.name})` : item.name ?? item.id,
      })),
      contractors: contractors.map(toOption),
    };
  } catch (error) {
    logger.error('Error al obtener los filtros del selector de empleados', { data: { error } });
    throw error;
  }
}

// ─── Carga individual ───────────────────────────────────────────────────────

const individualCheckSchema = z.object({
  employeeId: uuidLike,
  ranges: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .min(1)
    .max(MASSIVE_MAX_RANGES),
});

/**
 * Novedades ya cargadas de un empleado de la empresa activa dentro de los rangos de una carga individual, en una
 * sola consulta (un `OR` por rango). Reemplaza al `getEmployeeDiagramByIdandDate` de a un rango, que además
 * devolvía `[]` ante un error y hacía parecer libres días que no se habían podido consultar.
 */
export async function getEmployeeDiagramsInRanges(input: z.input<typeof individualCheckSchema>) {
  await assertDiagramAccess('new', 'employees');
  const { employeeId, ranges } = individualCheckSchema.parse(input);
  const issue = findRangesIssue(ranges, { maxRanges: MASSIVE_MAX_RANGES, maxTotalDays: INDIVIDUAL_MAX_TOTAL_DAYS });
  if (issue) throw new Error(issue.message);
  const companyId = await getActiveCompanyId();

  const wheres = ranges.map((range) => buildDiagramDayRangeWhere(toDiagramDay(range.from), toDiagramDay(range.to)));

  try {
    const rows = await prisma.employees_diagram.findMany({
      where: {
        employee_id: employeeId,
        employees: { company_id: companyId },
        ...(wheres.length === 1 ? wheres[0] : { OR: wheres }),
      },
      select: {
        id: true,
        day: true,
        month: true,
        year: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { select: { name: true, color: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      day: Number(row.day),
      month: Number(row.month),
      year: Number(row.year),
      name: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.name,
      color: row.diagram_type_employees_diagram_diagram_typeTodiagram_type.color,
    }));
  } catch (error) {
    logger.error('Error al obtener las novedades del empleado por rangos', { data: { error, employeeId } });
    throw error;
  }
}

export type ExistingDayRow = Awaited<ReturnType<typeof getEmployeeDiagramsInRanges>>[number];
