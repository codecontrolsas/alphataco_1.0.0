'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel } from '@/shared/lib/resource-labels';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

import { assertDiagramAccess } from '../lib/diagram-access';
import { buildDiagramDayRangeWhere, diagramDayKey, toDiagramDay, type DiagramDay } from '../lib/diagram-dates';
import { uuidLike } from '../lib/diagram-ids';

const logger = new Logger('Employees/Diagrams/Reports/actions.server');

/** Tope de filas del export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Tamaño máximo de página. */
const MAX_PAGE_SIZE = 200;

/** Máximo de movimientos del historial de una casilla que se devuelven. */
const HISTORY_MAX_ROWS = 30;

/** Límites del rango de fechas cuando el filtro llega abierto por un lado (el formulario acepta 2000-2100). */
const MIN_DIAGRAM_DAY: DiagramDay = { year: 2000, month: 1, day: 1 };
const MAX_DIAGRAM_DAY: DiagramDay = { year: 2100, month: 12, day: 31 };

/** Columnas con filtro de texto sobre campos del empleado o de la novedad. */
const TEXT_FILTER_KEYS = ['lastname', 'firstname', 'cuil', 'fileNumber', 'comments'] as const;
/** Columnas numéricas (day/month/year) con filtro de texto exacto. */
const NUMBER_FILTER_KEYS = ['day', 'month', 'year'] as const;

/** Lista blanca de filtros de la tabla: cualquier otra clave de la URL se descarta. */
const ALLOWED_FILTER_KEYS = new Set<string>([
  'employee',
  'diagramType',
  'companyPosition',
  ...TEXT_FILTER_KEYS,
  ...NUMBER_FILTER_KEYS,
  // `date`: fecha de la novedad (período). `created_at`: cuándo se registró.
  ...dateRangeKeys(['date', 'created_at']),
]);

type ReportOrderBy = Prisma.employees_diagramOrderByWithRelationInput;

/** Orden por columna: cada clave de la tabla se traduce a su `orderBy` de Prisma (incluye las relaciones). */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => ReportOrderBy[]> = {
  date: (dir) => [{ year: dir }, { month: dir }, { day: dir }],
  day: (dir) => [{ day: dir }],
  month: (dir) => [{ month: dir }],
  year: (dir) => [{ year: dir }],
  created_at: (dir) => [{ created_at: dir }],
  comments: (dir) => [{ comments: dir }],
  employee: (dir) => [{ employees: { lastname: dir } }, { employees: { firstname: dir } }],
  fileNumber: (dir) => [{ employees: { file: dir } }],
  cuil: (dir) => [{ employees: { cuil: dir } }],
  companyPosition: (dir) => [{ employees: { company_positions: { name: dir } } }],
  diagramType: (dir) => [{ diagram_type_employees_diagram_diagram_typeTodiagram_type: { name: dir } }],
};

/** Desempate: lo más reciente primero; `id` para que la paginación sea estable. */
const DEFAULT_ORDER: ReportOrderBy[] = [{ year: 'desc' }, { month: 'desc' }, { day: 'desc' }, { id: 'asc' }];

/**
 * Select de la tabla: solo lo que se muestra. El empleado y el tipo de novedad ya viajan por sus ids
 * (`employee_id`, `diagram_type.id`), así que no se repiten las claves foráneas sueltas.
 */
const DIAGRAM_REPORT_SELECT = {
  id: true,
  created_at: true,
  day: true,
  month: true,
  year: true,
  comments: true,
  employee_id: true,
  employees: {
    select: {
      lastname: true,
      firstname: true,
      cuil: true,
      file: true,
      company_positions: { select: { id: true, name: true } },
    },
  },
  diagram_type_employees_diagram_diagram_typeTodiagram_type: {
    select: { id: true, name: true, color: true, short_description: true },
  },
} satisfies Prisma.employees_diagramSelect;

type DiagramReportRecord = Prisma.employees_diagramGetPayload<{ select: typeof DIAGRAM_REPORT_SELECT }>;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

type ReportState = ReturnType<typeof parseSearchParams>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * Límites del día argentino (UTC-3, sin horario de verano) de un filtro `YYYY-MM-DD`. El fin cubre
 * todo el día (23:59:59.999), no la medianoche, para incluir los registros de ese día.
 */
function argentinaDayBound(value: string, bound: 'start' | 'end'): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const day = value.slice(0, 10);
  const date = new Date(bound === 'start' ? `${day}T00:00:00.000-03:00` : `${day}T23:59:59.999-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` estricto → día/mes/año; `null` si el texto no es una fecha real. */
function parseDay(value: string | undefined): DiagramDay | null {
  if (!value) return null;
  try {
    return toDiagramDay(value);
  } catch {
    return null;
  }
}

/** Ids válidos de un filtro faceteado (descarta el centinela de nulo y texto que no es UUID). */
function validIds(values: string[]): string[] {
  return values.filter((value) => value !== NULL_FILTER_VALUE && uuidLike.safeParse(value).success);
}

/**
 * Construye el WHERE compartido entre paginated, export, totales y facets. El perímetro (empleados activos de la
 * empresa) y todos los filtros van en un único `AND`. Los campos están en relaciones anidadas, por eso
 * los filtros se arman a mano en vez de pasar por `buildFiltersWhere`.
 */
function buildWhereClause(companyId: string, rawState: ReportState): Prisma.employees_diagramWhereInput {
  const state = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);
  const and: Prisma.employees_diagramWhereInput[] = [
    // ── Perímetro: empleados activos de la empresa ───────────────────────────
    { employees: { company_id: companyId, is_active: true } },
  ];

  // ── Búsqueda global (OR entre múltiples campos de empleado) ─────────────
  if (state.search) {
    and.push({
      OR: [
        { employees: { lastname: { contains: state.search, mode: 'insensitive' } } },
        { employees: { firstname: { contains: state.search, mode: 'insensitive' } } },
        { employees: { cuil: { contains: state.search, mode: 'insensitive' } } },
        { employees: { file: { contains: state.search, mode: 'insensitive' } } },
      ],
    });
  }

  // ── Filtro por empleado (FK: employee_id) ────────────────────────────────
  const employeeFilter = state.filters['employee'];
  if (employeeFilter?.length) {
    and.push({ employee_id: { in: validIds(employeeFilter) } });
  }

  // ── Filtro por tipo de novedad (FK: diagram_type) ────────────────────────
  const diagramTypeFilter = state.filters['diagramType'];
  if (diagramTypeFilter?.length) {
    and.push({ diagram_type: { in: validIds(diagramTypeFilter) } });
  }

  // ── Filtro por puesto (FK: company_position vía employees) ───────────────
  const companyPositionFilter = state.filters['companyPosition'];
  if (companyPositionFilter?.length) {
    const hasNull = companyPositionFilter.includes(NULL_FILTER_VALUE);
    const realValues = validIds(companyPositionFilter);
    if (hasNull && realValues.length > 0) {
      and.push({
        OR: [{ employees: { company_position: { in: realValues } } }, { employees: { company_position: null } }],
      });
    } else if (hasNull) {
      and.push({ employees: { company_position: null } });
    } else {
      and.push({ employees: { company_position: { in: realValues } } });
    }
  }

  // ── Filtros de texto en campos del empleado (cada uno por separado) ──────
  const lastnameFilter = state.filters['lastname']?.[0];
  if (lastnameFilter) {
    and.push({ employees: { lastname: { contains: lastnameFilter, mode: 'insensitive' } } });
  }

  const firstnameFilter = state.filters['firstname']?.[0];
  if (firstnameFilter) {
    and.push({ employees: { firstname: { contains: firstnameFilter, mode: 'insensitive' } } });
  }

  const cuilFilter = state.filters['cuil']?.[0];
  if (cuilFilter) {
    and.push({ employees: { cuil: { contains: cuilFilter, mode: 'insensitive' } } });
  }

  // Legajo: coincidencia exacta (no contains) — los legajos son números cortos
  const fileNumberFilter = state.filters['fileNumber']?.[0];
  if (fileNumberFilter) {
    and.push({ employees: { file: { equals: fileNumberFilter, mode: 'insensitive' } } });
  }

  // ── Filtro de texto en comentario (campo directo) ────────────────────────
  const commentsFilter = state.filters['comments']?.[0];
  if (commentsFilter) {
    and.push({ comments: { contains: commentsFilter, mode: 'insensitive' } });
  }

  // ── Filtros numéricos en day/month/year (Decimal): solo enteros ─────────
  for (const key of NUMBER_FILTER_KEYS) {
    const raw = state.filters[key]?.[0]?.trim();
    if (!raw) continue;
    // Un valor que no es entero no puede coincidir con ninguna fila: se excluye todo en vez de ignorar el filtro.
    if (!/^\d{1,4}$/.test(raw)) {
      and.push({ id: { in: [] } });
      continue;
    }
    const equals = Number(raw);
    and.push(key === 'day' ? { day: { equals } } : key === 'month' ? { month: { equals } } : { year: { equals } });
  }

  // ── Período: fecha de la novedad (day/month/year), abierto por un lado o por ambos ──
  const dateFrom = state.filters['date_from']?.[0];
  const dateTo = state.filters['date_to']?.[0];
  if (dateFrom || dateTo) {
    const from = dateFrom ? parseDay(dateFrom) : MIN_DIAGRAM_DAY;
    const to = dateTo ? parseDay(dateTo) : MAX_DIAGRAM_DAY;
    // Fecha mal formada o rango invertido: no puede coincidir nada, así que no se ignora el filtro.
    if (from && to && diagramDayKey(from) <= diagramDayKey(to)) {
      and.push(buildDiagramDayRangeWhere(from, to));
    } else {
      and.push({ id: { in: [] } });
    }
  }

  // ── Fecha de registro (dateRange: created_at), en hora argentina ─────────
  const createdAtFrom = state.filters['created_at_from']?.[0];
  const createdAtTo = state.filters['created_at_to']?.[0];
  const createdAt: Prisma.DateTimeFilter = {};
  const fromDate = createdAtFrom ? argentinaDayBound(createdAtFrom, 'start') : null;
  const toDate = createdAtTo ? argentinaDayBound(createdAtTo, 'end') : null;
  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lte = toDate;
  if (fromDate || toDate) and.push({ created_at: createdAt });

  return { AND: and };
}

/** `orderBy` seguro: solo columnas de la lista, en el orden pedido, con el desempate por fecha al final. */
function buildOrderBy(state: ReportState): ReportOrderBy[] {
  const sorts = state.sorting.flatMap((sort) => SORT_MAP[sort.id]?.(sort.desc ? 'desc' : 'asc') ?? []);
  return [...sorts, ...DEFAULT_ORDER];
}

/** Fila lista para la tabla: sin `Decimal` (el cliente no los puede recibir) y con la fecha ya armada. */
function toReportRow(record: DiagramReportRecord) {
  const day = Number(record.day);
  const month = Number(record.month);
  const year = Number(record.year);
  const diagramType = record.diagram_type_employees_diagram_diagram_typeTodiagram_type;

  return {
    id: record.id,
    createdAt: record.created_at,
    /** `YYYY-MM-DD` de la novedad. */
    date: diagramDayKey({ year, month, day }),
    day,
    month,
    year,
    comments: record.comments,
    employee: {
      id: record.employee_id,
      fileNumber: record.employees.file,
      lastname: record.employees.lastname,
      firstname: record.employees.firstname,
      cuil: record.employees.cuil,
    },
    position: record.employees.company_positions,
    diagramType: {
      id: diagramType.id,
      name: diagramType.name,
      color: diagramType.color,
      shortDescription: diagramType.short_description,
    },
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getDiagramReportsPaginated(searchParams: DataTableSearchParams) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = buildWhereClause(companyId, state);

    const [records, total] = await Promise.all([
      prisma.employees_diagram.findMany({
        skip,
        take,
        orderBy: buildOrderBy(state),
        where,
        select: DIAGRAM_REPORT_SELECT,
      }),
      prisma.employees_diagram.count({ where }),
    ]);

    return { data: records.map(toReportRow), total };
  } catch (error) {
    logger.error('Error al obtener reportes de diagramas paginados', { data: { error } });
    throw new Error(`Error al obtener los reportes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type DiagramReportListItem = Awaited<ReturnType<typeof getDiagramReportsPaginated>>['data'][number];

// ============================================================================
// TOTALES POR NOVEDAD
// ============================================================================

/**
 * Cantidad de novedades por tipo con TODOS los filtros activos (también el propio tipo: son los totales de lo
 * que muestra la tabla). Un `groupBy` y una consulta de nombres; no depende de la página ni del orden.
 */
export async function getDiagramReportTotals(searchParams: DataTableSearchParams) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const where = buildWhereClause(companyId, parseSearchParams(searchParams));
    const groups = await prisma.employees_diagram.groupBy({ by: ['diagram_type'], where, _count: true });

    const types = groups.length
      ? await prisma.diagram_type.findMany({
          where: { id: { in: groups.map((g) => g.diagram_type) }, company_id: companyId },
          select: { id: true, name: true, color: true, short_description: true },
        })
      : [];
    const typeById = new Map(types.map((type) => [type.id, type]));

    const items = groups
      .flatMap((group) => {
        const type = typeById.get(group.diagram_type);
        return type
          ? [
              {
                id: type.id,
                name: type.name ?? type.short_description,
                shortDescription: type.short_description,
                color: type.color,
                count: group._count,
              },
            ]
          : [];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { total: items.reduce((sum, item) => sum + item.count, 0), items };
  } catch (error) {
    logger.error('Error al obtener los totales por novedad', { data: { error } });
    throw new Error('Error al obtener los totales por novedad');
  }
}

export type DiagramReportTotals = Awaited<ReturnType<typeof getDiagramReportTotals>>;

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla. Tope de `EXPORT_MAX_ROWS`: si se supera devuelve
 * `{ ok: false, message }` (Next enmascara el mensaje de un error lanzado). El cliente lo abre con `unwrapExportResult`.
 */
export async function getDiagramReportsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<DiagramReportListItem[]>> {
  try {
    await assertDiagramAccess('reports');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar los reportes de novedades' };
  }
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const records = await prisma.employees_diagram.findMany({
      orderBy: [{ employees: { lastname: 'asc' } }, { employees: { firstname: 'asc' } }, ...DEFAULT_ORDER],
      where,
      select: DIAGRAM_REPORT_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (records.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: records.map(toReportRow) };
  } catch (error) {
    logger.error('Error al exportar reportes de diagramas', { data: { error } });
    return { ok: false, message: 'Error al exportar los reportes de diagramas' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse. Si la consulta falla se loguea y
 * devuelve counts vacíos (el filtro queda sin opciones en vez de romper la tabla).
 */
export async function getDiagramReportSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const state = parseSearchParams(searchParams ?? {});
    // Cross-filter: los counts de una faceta no se condicionan por su propia selección.
    const where = buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    // ── employee FK (group by employee_id, resolve names) ──────────────────
    if (columnId === 'employee') {
      const rows = await prisma.employees_diagram.groupBy({
        by: ['employee_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.employee_id, count: r._count })));
      const ids = rows.map((r) => r.employee_id);
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.employees.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, lastname: true, firstname: true, file: true },
                orderBy: { lastname: 'asc' },
              })
            ).map((e) => ({ id: e.id, name: employeeLabel(e) }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── diagramType FK (group by diagram_type, resolve names) ──────────────
    if (columnId === 'diagramType') {
      const rows = await prisma.employees_diagram.groupBy({
        by: ['diagram_type'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.diagram_type, count: r._count })));
      const ids = rows.map((r) => r.diagram_type);
      const resolvedOptions =
        ids.length > 0
          ? await prisma.diagram_type.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── companyPosition FK (puesto del empleado) ────────────────────────────
    if (columnId === 'companyPosition') {
      // No se puede agrupar por un campo de la relación: se agrupa por empleado (una fila por empleado,
      // no por novedad) y el puesto se resuelve con una sola consulta sobre esos empleados.
      const perEmployee = await prisma.employees_diagram.groupBy({
        by: ['employee_id'],
        where,
        _count: true,
      });
      const employeeIds = perEmployee.map((r) => r.employee_id);
      const employees = employeeIds.length
        ? await prisma.employees.findMany({
            where: { id: { in: employeeIds }, company_id: companyId },
            select: { id: true, company_position: true },
          })
        : [];
      const positionByEmployee = new Map(employees.map((e) => [e.id, e.company_position]));
      const rowsByPosition = new Map<string | null, number>();
      for (const row of perEmployee) {
        const position = positionByEmployee.get(row.employee_id) ?? null;
        rowsByPosition.set(position, (rowsByPosition.get(position) ?? 0) + row._count);
      }
      const counts = toFacetMap([...rowsByPosition].map(([key, count]) => ({ key, count })));

      const ids = [...rowsByPosition.keys()].filter((id): id is string => id != null);
      const resolvedOptions =
        ids.length > 0
          ? await prisma.company_positions.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

      return { counts, resolvedOptions };
    }

    logger.warn('Facet column not recognized', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de diagrama', { data: { error, columnId } });
    return { counts: new Map() };
  }
}

// ============================================================================
// DETALLE DE UNA NOVEDAD: HISTORIAL Y TIPOS EDITABLES
// ============================================================================

/**
 * Movimientos de una casilla (empleado + día), del más nuevo al más viejo. Salen de `diagrams_logs`, que arma un
 * trigger al crear o cambiar una novedad. El log no apunta a la fila de `employees_diagram`: se ubica por
 * empleado y por el día que guarda en `prev_date` (medianoche del día de la novedad).
 */
export async function getDiagramCellHistory(employeeId: string, date: string) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);
  if (!uuidLike.safeParse(employeeId).success) throw new Error('Empleado inválido');
  const day = parseDay(date);
  if (!day) throw new Error('Fecha inválida');

  try {
    const dayStart = moment.utc(diagramDayKey(day), 'YYYY-MM-DD');
    const logs = await prisma.diagrams_logs.findMany({
      where: {
        employee_id: employeeId,
        employees: { company_id: companyId },
        prev_date: { gte: dayStart.toDate(), lt: dayStart.clone().add(1, 'day').toDate() },
      },
      select: {
        id: true,
        created_at: true,
        description: true,
        state: true,
        prev_state: true,
        profile: { select: { fullname: true } },
      },
      orderBy: { created_at: 'desc' },
      take: HISTORY_MAX_ROWS,
    });

    return logs.map((log) => ({
      id: log.id,
      changedAt: log.created_at,
      shortDescription: log.description,
      state: log.state,
      previousState: log.prev_state,
      changedBy: log.profile?.fullname ?? null,
    }));
  } catch (error) {
    logger.error('Error al obtener el historial de la novedad', { data: { error, employeeId, date } });
    throw new Error('Error al obtener el historial de la novedad');
  }
}

export type DiagramCellHistoryItem = Awaited<ReturnType<typeof getDiagramCellHistory>>[number];

/** Tipos de novedad activos de la empresa para el selector de la edición rápida. */
export async function getReportDiagramTypes() {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const types = await prisma.diagram_type.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, name: true, color: true, short_description: true },
      orderBy: { name: 'asc' },
    });
    return types.map((type) => ({
      id: type.id,
      name: type.name ?? type.short_description,
      color: type.color,
      shortDescription: type.short_description,
    }));
  } catch (error) {
    logger.error('Error al obtener los tipos de novedad activos', { data: { error } });
    throw new Error('Error al obtener los tipos de novedad');
  }
}

export type ReportDiagramType = Awaited<ReturnType<typeof getReportDiagramTypes>>[number];
