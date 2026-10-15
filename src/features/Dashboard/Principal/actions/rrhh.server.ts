'use server';

import { percentageOrNull } from '@/features/Dashboard/lib/metric';
import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getOperationToday, getTodayParts } from '../lib/dashboard-dates';
import { aggregateDiagramIndicators } from '../lib/indicators';
import { positionFilter, sanitizePositionIds } from '../lib/position-filter';
import { toFacetMap } from '../lib/row-mapping';
import type { DiagramIndicatorResult, EmployeeIndicatorResult } from './types';

const logger = new Logger('features/Dashboard/Principal/rrhh');

/**
 * Personal del dashboard principal: indicador de uso, distribución por diagrama y la tabla
 * paginada del diálogo de disponibles.
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

    const [operativeDiagrams, usedRelations] = await Promise.all([
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
      prisma.dailyreportemployeerelations.findMany({
        where: {
          employee_id: { not: null },
          dailyreportrows: {
            dailyreport: { date: new Date(todayDate), is_active: true, company_id: companyId },
          },
          employees: { is_active: true, ...positionFilter(positions) },
        },
        select: { employee_id: true },
        distinct: ['employee_id'],
      }),
    ]);

    const employeesOperativos = operativeDiagrams.length;
    const employeesUsed = usedRelations.length;

    return {
      employees_operativos: employeesOperativos,
      employees_used: employeesUsed,
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

export type AllPositionsData = Awaited<ReturnType<typeof getAllPositions>>;
export type PositionItem = AllPositionsData[number];

// ─────────────────────────────────────────────────────────────────────────────
// Diálogo de empleados disponibles — DataTable server-side
// ─────────────────────────────────────────────────────────────────────────────

/** Filtros de texto por coincidencia parcial. El legajo (`file`) va aparte: coincidencia EXACTA. */
const TEXT_COLUMNS = ['cuil'];
const COLUMN_MAP: Record<string, string> = { company_positions: 'company_position' };
const VALID_SORT_FIELDS = new Set(['name', 'cuil', 'file', 'company_positions']);
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>[]> = {
  company_positions: (dir) => [{ company_positions: { name: dir } }],
  name: (dir) => [{ lastname: dir }, { firstname: dir }],
};

/**
 * Select de empleados disponibles.
 *
 * El diagrama anidado se filtra por la fecha de HOY: sin ese filtro la relación devuelve
 * cualquier diagrama activo del historial del empleado (`take: 1` sin orden), y las
 * columnas "Diagrama" y "Comentario" terminan mostrando una novedad de otro día.
 */
function buildAvailableEmployeeSelect() {
  const { day, month, year } = getTodayParts();

  return {
    id: true,
    firstname: true,
    lastname: true,
    cuil: true,
    file: true,
    company_position: true,
    company_positions: { select: { id: true, name: true } },
    contractor_employee: { select: { contractor_id: true, customers: { select: { id: true, name: true } } } },
    employees_diagram: {
      select: {
        diagram_type: true,
        comments: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: {
          select: { short_description: true, color: true },
        },
      },
      where: {
        day,
        month,
        year,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: { work_active: true, is_active: true },
      },
      take: 1,
    },
  } as const;
}

/**
 * Ids de los empleados "disponibles" hoy, calculados en la base.
 *
 * Replica la aritmética del indicador: disponibles = operativos − TODOS los que están en
 * el parte, de ahí el `LIMIT` con la resta de los dos conteos.
 *
 * `positionIds` va BINDEADO como `uuid[]`; antes se concatenaba dentro del texto del SQL
 * con `$queryRawUnsafe`.
 */
async function getAvailableEmployeeIds(
  companyId: string,
  positionIds: readonly string[] | undefined,
  todayDate: string,
  day: number,
  month: number,
  year: number
): Promise<string[]> {
  // Vino filtro pero ningún id sobrevivió al saneo: ningún empleado puede caer dentro.
  if (positionIds !== undefined && positionIds.length === 0) return [];

  const hasPositions = positionIds !== undefined;
  const positionArray = [...(positionIds ?? [])];

  const operativePositionClause = hasPositions
    ? Prisma.sql`AND e.company_position = ANY(${positionArray}::uuid[])`
    : Prisma.empty;
  const reportPositionClause = hasPositions
    ? Prisma.sql`AND e.company_position = ANY(${positionArray}::uuid[])`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ employee_id: string }[]>(Prisma.sql`
    WITH operativos AS (
      SELECT DISTINCT ed.employee_id
      FROM employees_diagram ed
      INNER JOIN diagram_type dt ON ed.diagram_type = dt.id
      INNER JOIN employees e ON ed.employee_id = e.id
      WHERE ed.day = ${day} AND ed.month = ${month} AND ed.year = ${year}
        AND dt.work_active = true AND dt.is_active = true
        AND e.is_active = true AND e.company_id = ${companyId}::uuid
        ${operativePositionClause}
    ),
    in_report AS (
      SELECT DISTINCT drer.employee_id
      FROM dailyreportemployeerelations drer
      INNER JOIN dailyreportrows drr ON drer.daily_report_row_id = drr.id
      INNER JOIN dailyreport dr ON drr.daily_report_id = dr.id
      INNER JOIN employees e ON drer.employee_id = e.id
      WHERE dr.date = ${todayDate}::date AND dr.is_active = true
        AND e.company_id = ${companyId}::uuid AND e.is_active = true
        AND drer.employee_id IS NOT NULL
        ${reportPositionClause}
    )
    SELECT o.employee_id
    FROM operativos o
    WHERE o.employee_id NOT IN (SELECT employee_id FROM in_report)
    LIMIT GREATEST(
      (SELECT COUNT(*)::int FROM operativos) - (SELECT COUNT(*)::int FROM in_report),
      0
    )
  `);

  return rows.map((row) => row.employee_id);
}

/**
 * WHERE de empleados disponibles: con diagrama de trabajo hoy, fuera del parte, y con los
 * filtros activos del DataTable aplicados.
 */
async function buildAvailableEmployeesWhere(
  companyId: string,
  positionIds: readonly string[] | undefined,
  state: ReturnType<typeof parseSearchParams>
) {
  const { day, month, year } = getTodayParts();
  const todayDate = getOperationToday();

  const availableIds = await getAvailableEmployeeIds(companyId, positionIds, todayDate, day, month, year);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_COLUMNS, 'file', 'name', 'comments', 'customers', 'diagram'],
  });

  const customerValues = state.filters['customers'];
  const m2mFilter: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  if (customerValues?.length) {
    const hasNull = customerValues.includes(NULL_FILTER_VALUE);
    const realValues = customerValues.filter((value) => value !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { contractor_employee: { some: { contractor_id: { in: realValues } } } },
          { contractor_employee: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilter.contractor_employee = { none: {} };
    } else {
      m2mFilter.contractor_employee = { some: { contractor_id: { in: realValues } } };
    }
  }

  // Nombre: el filtro busca en apellido o nombre (la columna los muestra juntos).
  const nameText = state.filters['name']?.[0]?.trim();
  if (nameText) {
    extraAndConditions.push({
      OR: [
        { lastname: { contains: nameText, mode: 'insensitive' } },
        { firstname: { contains: nameText, mode: 'insensitive' } },
      ],
    });
  }

  // Diagrama: el tipo de diagrama de trabajo de HOY (todos los disponibles tienen uno).
  const diagramValues = (state.filters['diagram'] ?? []).filter((value) => value !== NULL_FILTER_VALUE);
  if (diagramValues.length > 0) {
    extraAndConditions.push({
      employees_diagram: {
        some: {
          day,
          month,
          year,
          diagram_type: { in: diagramValues },
          diagram_type_employees_diagram_diagram_typeTodiagram_type: { work_active: true, is_active: true },
        },
      },
    });
  }

  // Comentario: el del diagrama de HOY, el mismo que muestra la columna.
  const commentText = state.filters['comments']?.[0]?.trim();
  if (commentText) {
    extraAndConditions.push({
      employees_diagram: {
        some: {
          day,
          month,
          year,
          comments: { contains: commentText, mode: 'insensitive' },
          diagram_type_employees_diagram_diagram_typeTodiagram_type: { work_active: true, is_active: true },
        },
      },
    });
  }

  // Legajo: coincidencia exacta (con `contains`, buscar «1» traería 1, 10, 100...).
  const fileNumber = state.filters['file']?.[0]?.trim();

  const filtersWhereRecord = filtersWhere as Record<string, unknown> & { AND?: Record<string, unknown>[] };
  const allAndConditions = [...(filtersWhereRecord.AND ?? []), ...extraAndConditions];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhereRecord;

  // Los filtros del usuario primero; lo que define el diálogo (disponibles de la empresa activa) va al
  // final y no se puede pisar desde la URL.
  return {
    ...(fileNumber ? { file: fileNumber } : {}),
    ...buildSearchWhere(state.search, ['lastname', 'firstname', 'cuil', 'file']),
    ...filtersWhereWithoutAnd,
    ...buildTextFiltersWhere(state.filters, TEXT_COLUMNS),
    ...m2mFilter,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
    id: { in: availableIds },
    is_active: true as const,
    company_id: companyId,
  };
}

/** Empleados disponibles paginados (con diagrama de trabajo hoy y fuera del parte). */
export async function getAvailableEmployeesPaginated(searchParams: DataTableSearchParams, positionIds?: string[]) {
  await requireDashboardView('principal');
  logger.debug('Obteniendo empleados disponibles paginados', { data: { positionIds } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildAvailableEmployeesWhere(companyId, sanitizePositionIds(positionIds), state);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const sort of state.sorting) {
      if (!VALID_SORT_FIELDS.has(sort.id)) continue;
      const dir: 'asc' | 'desc' = sort.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[sort.id];
      resolvedSorts.push(...(fkMapper ? fkMapper(dir) : [{ [sort.id]: dir }]));
    }
    const safeOrderBy = [...resolvedSorts, { lastname: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.employees.findMany({ where, skip, take, orderBy: safeOrderBy, select: buildAvailableEmployeeSelect() }),
      prisma.employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener empleados disponibles paginados', { data: { error } });
    throw error;
  }
}

// Tipo inferido desde la query — NUNCA tipar manualmente
export type AvailableEmployeeListItem = Awaited<ReturnType<typeof getAvailableEmployeesPaginated>>['data'][number];

/** Tope de filas de la exportación del diálogo. */
const EXPORT_LIMIT = 10_000;

/** Todos los empleados disponibles (hasta el tope), para la exportación a Excel. */
export async function getAllAvailableEmployeesForExport(
  searchParams: DataTableSearchParams,
  positionIds?: string[]
): Promise<ExportResult<AvailableEmployeeListItem[]>> {
  await requireDashboardView('principal');
  logger.debug('Exportando empleados disponibles', { data: { positionIds } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = await buildAvailableEmployeesWhere(companyId, sanitizePositionIds(positionIds), state);
    const orderBy = [{ lastname: 'asc' as const }, { id: 'asc' as const }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) => prisma.employees.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.employees.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: buildAvailableEmployeeSelect(),
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} empleados con los filtros actuales. Acote la exportación con filtros.`,
    });

    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar empleados disponibles', { data: { error } });
    // Next enmascara el mensaje de un error lanzado desde una server action: se devuelve como resultado.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de empleados. Intente nuevamente.',
    };
  }
}

/** Facetas por columna con cross-filter para el listado de empleados disponibles. */
export async function getAvailableEmployeeSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams,
  positionIds?: string[]
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo facet de empleados disponibles', { data: { columnId } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const positions = sanitizePositionIds(positionIds);

    async function crossWhere(excludeColumn: string) {
      const modified = { ...state, filters: { ...state.filters } };
      delete modified.filters[excludeColumn];
      delete modified.filters[`${excludeColumn}_from`];
      delete modified.filters[`${excludeColumn}_to`];
      return buildAvailableEmployeesWhere(companyId, positions, modified);
    }

    switch (columnId) {
      case 'company_positions': {
        const where = await crossWhere('company_positions');
        const rows = await prisma.employees.groupBy({ by: ['company_position'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.company_position, count: row._count })));
        const ids = rows.map((row) => row.company_position).filter((id): id is string => id != null);
        const resolvedOptions =
          ids.length > 0
            ? await prisma.company_positions.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions };
      }

      case 'customers': {
        const where = await crossWhere('customers');
        const [totalInCross, withCustomer, relations] = await Promise.all([
          prisma.employees.count({ where }),
          prisma.employees.count({ where: { ...where, contractor_employee: { some: {} } } }),
          prisma.contractor_employee.findMany({
            where: { employees: where },
            select: { contractor_id: true, employee_id: true, customers: { select: { id: true, name: true } } },
          }),
        ]);

        const counts = new Map<string, number>();
        const withoutCustomer = totalInCross - withCustomer;
        if (withoutCustomer > 0) counts.set(NULL_FILTER_VALUE, withoutCustomer);

        const employeesByContractor = new Map<string, Set<string>>();
        const customerNames = new Map<string, string>();
        for (const relation of relations) {
          const contractorId = relation.contractor_id;
          const employeeId = relation.employee_id;
          if (!contractorId || !employeeId) continue;
          let employeeSet = employeesByContractor.get(contractorId);
          if (!employeeSet) {
            employeeSet = new Set();
            employeesByContractor.set(contractorId, employeeSet);
          }
          employeeSet.add(employeeId);
          if (relation.customers?.name) customerNames.set(contractorId, relation.customers.name);
        }
        for (const [contractorId, employeeSet] of employeesByContractor) {
          counts.set(contractorId, employeeSet.size);
        }

        return { counts, resolvedOptions: [...customerNames.entries()].map(([id, name]) => ({ id, name })) };
      }

      case 'diagram': {
        const { day, month, year } = getTodayParts();
        const where = await crossWhere('diagram');
        const employees = await prisma.employees.findMany({ where, select: { id: true } });
        const ids = employees.map((employee) => employee.id);
        if (ids.length === 0) return { counts: new Map(), resolvedOptions: [] };

        const diagrams = await prisma.employees_diagram.findMany({
          where: {
            employee_id: { in: ids },
            day,
            month,
            year,
            diagram_type_employees_diagram_diagram_typeTodiagram_type: { work_active: true, is_active: true },
          },
          select: {
            diagram_type: true,
            diagram_type_employees_diagram_diagram_typeTodiagram_type: {
              select: { id: true, short_description: true },
            },
          },
          distinct: ['employee_id'],
        });

        const counts = new Map<string, number>();
        const diagramNames = new Map<string, string>();
        for (const diagram of diagrams) {
          const key = diagram.diagram_type;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          const diagramType = diagram.diagram_type_employees_diagram_diagram_typeTodiagram_type;
          if (diagramType?.short_description) diagramNames.set(key, diagramType.short_description);
        }

        return { counts, resolvedOptions: [...diagramNames.entries()].map(([id, name]) => ({ id, name })) };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet de empleados disponibles', { data: { error, columnId } });
    return null;
  }
}
