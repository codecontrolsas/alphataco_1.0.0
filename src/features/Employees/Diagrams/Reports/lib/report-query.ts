import type { Prisma } from '@/generated/prisma/client';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { buildDiagramDayRangeWhere, diagramDayKey, toDiagramDay, type DiagramDay } from '../../lib/diagram-dates';
import { uuidLike } from '../../lib/diagram-ids';

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
export const DEFAULT_ORDER: ReportOrderBy[] = [{ year: 'desc' }, { month: 'desc' }, { day: 'desc' }, { id: 'asc' }];

/**
 * Select de la tabla: solo lo que se muestra. El empleado y el tipo de novedad ya viajan por sus ids
 * (`employee_id`, `diagram_type.id`), así que no se repiten las claves foráneas sueltas.
 */
export const DIAGRAM_REPORT_SELECT = {
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
export function parseDay(value: string | undefined): DiagramDay | null {
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
export function buildWhereClause(companyId: string, rawState: ReportState): Prisma.employees_diagramWhereInput {
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
export function buildOrderBy(state: ReportState): ReportOrderBy[] {
  const sorts = state.sorting.flatMap((sort) => SORT_MAP[sort.id]?.(sort.desc ? 'desc' : 'asc') ?? []);
  return [...sorts, ...DEFAULT_ORDER];
}

/** Fila lista para la tabla: sin `Decimal` (el cliente no los puede recibir) y con la fecha ya armada. */
export function toReportRow(record: DiagramReportRecord) {
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
