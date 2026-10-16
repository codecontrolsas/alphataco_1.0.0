'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { z } from 'zod';
import { assertDiagramAccess } from '../lib/diagram-access';
import { buildDiagramDayRangeWhere, diagramDayKey, toDiagramDay } from '../lib/diagram-dates';
import { uuidLike } from '../lib/diagram-ids';

const logger = new Logger('features/Employees/Diagrams');

/** Máximo de días de la ventana de novedades que se trae por empleado. */
const MAX_WINDOW_DAYS = 366;
/** Ventana por defecto (días hacia atrás y hacia adelante desde hoy) cuando el cliente no manda fechas. */
const DEFAULT_WINDOW_DAYS = 93;

/**
 * Ventana de fechas de las novedades que se devuelven por empleado. Sin `dateFrom`/`dateTo` es
 * hoy ± `DEFAULT_WINDOW_DAYS` (hora argentina); con ellas, el rango pedido (máx. `MAX_WINDOW_DAYS`).
 */
function resolveDiagramWindow(dateFrom?: string, dateTo?: string) {
  const today = argentinaDate();
  const fromKey = dateFrom ?? moment.utc(today).subtract(DEFAULT_WINDOW_DAYS, 'days').format('YYYY-MM-DD');
  const toKey = dateTo ?? moment.utc(today).add(DEFAULT_WINDOW_DAYS, 'days').format('YYYY-MM-DD');
  const from = toDiagramDay(fromKey);
  const to = toDiagramDay(toKey);
  if (moment.utc(toKey).diff(moment.utc(fromKey), 'days') > MAX_WINDOW_DAYS) {
    throw new Error(`Máximo ${MAX_WINDOW_DAYS} días por consulta`);
  }
  return { from, to, today };
}

/** Filtros compartidos por la búsqueda de la carga masiva y la del calendario. */
type EmployeeSearchFilters = {
  /** Texto libre: cada palabra debe aparecer en el nombre, el apellido o el legajo. */
  search?: string;
  positions?: string[];
  workflows?: string[];
  costCenters?: string[];
  covenants?: string[];
  guilds?: string[];
  categories?: string[];
  contractors?: string[];
  diagramTypes?: string[];
};

const MAX_SEARCH_TOKENS = 5;
const MAX_SEARCH_TOKEN_LENGTH = 60;

/**
 * `where` de empleados activos de la empresa. Las condiciones que pueden combinarse con un `OR` propio
 * (texto libre y tipo de novedad) van dentro de `AND`, así una no pisa a la otra.
 */
function buildEmployeesWhere(
  params: EmployeeSearchFilters,
  companyId: string,
  today: string
): Prisma.employeesWhereInput {
  const where: Prisma.employeesWhereInput = { is_active: true, company_id: companyId };
  const and: Prisma.employeesWhereInput[] = [];

  if (params.positions?.length) where.company_position = { in: params.positions };
  if (params.workflows?.length) where.workflow_diagram = { in: params.workflows };
  if (params.costCenters?.length) where.cost_center_id = { in: params.costCenters };
  if (params.covenants?.length) where.covenants_id = { in: params.covenants };
  if (params.guilds?.length) where.guild_id = { in: params.guilds };
  if (params.categories?.length) where.category_id = { in: params.categories };
  if (params.contractors?.length) {
    where.contractor_employee = { some: { contractor_id: { in: params.contractors } } };
  }

  const tokens = (params.search ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS)
    .map((token) => token.slice(0, MAX_SEARCH_TOKEN_LENGTH));
  for (const token of tokens) {
    and.push({
      OR: [
        { firstname: { contains: token, mode: 'insensitive' } },
        { lastname: { contains: token, mode: 'insensitive' } },
        { file: { contains: token, mode: 'insensitive' } },
      ],
    });
  }

  // Diagram type filter — scoped to today's date (same as dashboard getDiagramIndicators)
  if (params.diagramTypes?.length) {
    const todayFilter = toDiagramDay(today);
    const hasNoDiagram = params.diagramTypes.includes('__none__');
    const actualTypes = params.diagramTypes.filter((t) => t !== '__none__');

    if (hasNoDiagram && actualTypes.length === 0) {
      and.push({ employees_diagram: { none: todayFilter } });
    } else if (hasNoDiagram) {
      and.push({
        OR: [
          { employees_diagram: { none: todayFilter } },
          { employees_diagram: { some: { ...todayFilter, diagram_type: { in: actualTypes } } } },
        ],
      });
    } else {
      and.push({ employees_diagram: { some: { ...todayFilter, diagram_type: { in: actualTypes } } } });
    }
  }

  if (and.length > 0) where.AND = and;
  return where;
}

// ── Catálogos de filtros ──────────────────────────────────────────────────────

const loadPositions = (companyId: string) =>
  prisma.company_positions.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

const loadWorkflows = (companyId: string) =>
  prisma.work_diagram.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

const loadCostCenters = (companyId: string) =>
  prisma.cost_center.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

const loadCovenants = (companyId: string) =>
  prisma.covenant.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

const loadGuilds = (companyId: string) =>
  prisma.guild.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

// `category` no tiene `company_id`: cuelga del convenio, que sí es de una empresa.
const loadCategories = (companyId: string) =>
  prisma.category.findMany({
    where: { is_active: true, covenant: { company_id: companyId } },
    select: { id: true, name: true, covenant: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

const loadContractors = (companyId: string) =>
  prisma.customers.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

// Trae color, sigla y estado: el panel de edición rápida los usa; el filtro del calendario muestra todos los tipos.
const loadDiagramTypes = (companyId: string) =>
  prisma.diagram_type.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true, short_description: true, color: true, is_active: true },
    orderBy: { name: 'asc' },
  });

/**
 * Los 8 catálogos del calendario en un solo viaje (queries en paralelo, un solo chequeo de permiso).
 * Los tipos de novedad traen color y sigla porque el panel de edición rápida también los usa.
 */
export async function getDiagramFilterCatalog() {
  await assertDiagramAccess('old', 'massive_diagram');
  const companyId = await getActiveCompanyId();

  try {
    const [positions, workflows, costCenters, covenants, guilds, categories, contractors, diagramTypes] =
      await Promise.all([
        loadPositions(companyId),
        loadWorkflows(companyId),
        loadCostCenters(companyId),
        loadCovenants(companyId),
        loadGuilds(companyId),
        loadCategories(companyId),
        loadContractors(companyId),
        loadDiagramTypes(companyId),
      ]);
    return { positions, workflows, costCenters, covenants, guilds, categories, contractors, diagramTypes };
  } catch (error) {
    logger.error('Error loading diagram filter catalog', { data: { error } });
    throw error;
  }
}

export type DiagramFilterCatalog = Awaited<ReturnType<typeof getDiagramFilterCatalog>>;

// ── Calendario ────────────────────────────────────────────────────────────────

const CALENDAR_PAGE_SIZE_MAX = 100;

/**
 * Página del calendario de diagramas. Devuelve lo mínimo que dibuja
 * la grilla: el empleado (nombre, apellido y legajo por separado) y, por cada día de la ventana pedida, el id de
 * la novedad, su tipo y el comentario. Los tipos viajan una sola vez por página y no repetidos en cada día.
 * Los datos extra del Excel se piden recién al exportar (`getDiagramExportDetails`).
 */
export async function searchDiagramCalendar(
  params: EmployeeSearchFilters & {
    page: number;
    pageSize: number;
    dateFrom: string;
    dateTo: string;
  }
) {
  await assertDiagramAccess('old', 'massive_diagram');
  const companyId = await getActiveCompanyId();

  try {
    const diagramWindow = resolveDiagramWindow(params.dateFrom, params.dateTo);
    const { skip, take } = clampedPageParams(
      { page: Number(params.page) - 1, pageSize: Number(params.pageSize) },
      { max: CALENDAR_PAGE_SIZE_MAX, fallback: 50 }
    );
    const where = buildEmployeesWhere(params, companyId, diagramWindow.today);

    const [employees, total] = await Promise.all([
      prisma.employees.findMany({
        where,
        select: {
          id: true,
          firstname: true,
          lastname: true,
          file: true,
          employees_diagram: {
            where: buildDiagramDayRangeWhere(diagramWindow.from, diagramWindow.to),
            select: {
              id: true,
              day: true,
              month: true,
              year: true,
              comments: true,
              diagram_type_employees_diagram_diagram_typeTodiagram_type: {
                select: { id: true, name: true, color: true, short_description: true },
              },
            },
          },
        },
        orderBy: [{ lastname: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.employees.count({ where }),
    ]);

    const types = new Map<string, { id: string; name: string | null; color: string; short_description: string }>();
    const rows = employees.map((employee) => {
      const days: Record<string, { id: string; typeId: string; comments: string | null }> = {};
      for (const entry of employee.employees_diagram) {
        const type = entry.diagram_type_employees_diagram_diagram_typeTodiagram_type;
        types.set(type.id, type);
        const key = diagramDayKey({ year: Number(entry.year), month: Number(entry.month), day: Number(entry.day) });
        days[key] = { id: entry.id, typeId: type.id, comments: entry.comments };
      }
      return { id: employee.id, firstname: employee.firstname, lastname: employee.lastname, file: employee.file, days };
    });

    return { rows, types: [...types.values()], total, hasMore: skip + take < total };
  } catch (error) {
    logger.error('Error searching diagram calendar', { data: { error } });
    throw error;
  }
}

export type DiagramCalendarPage = Awaited<ReturnType<typeof searchDiagramCalendar>>;
export type DiagramCalendarRow = DiagramCalendarPage['rows'][number];
export type DiagramCalendarType = DiagramCalendarPage['types'][number];

const MAX_EXPORT_EMPLOYEES = 1000;
const exportIdsSchema = z.array(uuidLike).max(MAX_EXPORT_EMPLOYEES);

/** Datos del empleado que acompañan al Excel (puesto, sector, diagrama, centro de costo, etc.), por id. */
export async function getDiagramExportDetails(employeeIds: string[]) {
  await assertDiagramAccess('old', 'massive_diagram');
  const companyId = await getActiveCompanyId();
  const parsed = exportIdsSchema.safeParse(employeeIds);
  if (!parsed.success) throw new Error(`No se pueden exportar más de ${MAX_EXPORT_EMPLOYEES} empleados a la vez`);
  if (parsed.data.length === 0) return {};

  try {
    const employees = await prisma.employees.findMany({
      where: { id: { in: parsed.data }, company_id: companyId },
      select: {
        id: true,
        date_of_admission: true,
        company_positions: { select: { name: true } },
        hierarchy: { select: { name: true } },
        work_diagram: { select: { name: true } },
        cost_center: { select: { name: true } },
        category: { select: { name: true } },
        covenant: { select: { name: true } },
        guild: { select: { name: true } },
      },
    });

    return Object.fromEntries(
      employees.map((employee) => [
        employee.id,
        {
          position: employee.company_positions?.name ?? '',
          sector: employee.hierarchy?.name ?? '',
          // `date_of_admission` es `@db.Date`: se serializa como 'YYYY-MM-DD'.
          dateOfAdmission: toDateOnly(employee.date_of_admission),
          workDiagram: employee.work_diagram?.name ?? '',
          costCenter: employee.cost_center?.name ?? '',
          category: employee.category?.name ?? '',
          covenant: employee.covenant?.name ?? '',
          guild: employee.guild?.name ?? '',
        },
      ])
    );
  } catch (error) {
    logger.error('Error loading diagram export details', { data: { error } });
    throw error;
  }
}

export type DiagramExportDetails = Awaited<ReturnType<typeof getDiagramExportDetails>>[string];
