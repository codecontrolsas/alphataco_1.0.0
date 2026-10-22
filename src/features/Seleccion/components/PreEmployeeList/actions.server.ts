'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { pre_employee_status_enum } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Employees/PreLegajos/PreEmployeeList/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de pre_employees que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'pre_file_number',
  'document_number',
  'cuil',
  'status',
  'phone',
  'email',
  'rejection_reason',
  'created_at',
  'reviewed_at',
  // FK columns (ordenadas via FK_SORT_MAP)
  'hierarchy',
  'company_positions',
]);

/**
 * Mapeo de columnId → orderBy de Prisma para columnas FK.
 * Las columnas FK necesitan { relation: { campo: dir } }.
 */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  hierarchy: (dir) => ({ hierarchy: { name: dir } }),
  company_positions: (dir) => ({ company_positions: { name: dir } }),
};

/** Columnas que son filtros de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = ['pre_file_number', 'document_number', 'cuil', 'phone', 'email', 'rejection_reason'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['created_at', 'reviewed_at'];

/**
 * Mapping de columnId (URL) → campo real en Prisma.
 * Solo para columnas cuyo ID en la URL difiere del campo/relación en la BD.
 */
const COLUMN_MAP: Record<string, string> = {
  hierarchy: 'proposed_hierarchical_position',
  company_positions: 'proposed_company_position',
};

/**
 * Lista blanca de filtros de la URL: `parseSearchParams` convierte CUALQUIER clave en un filtro y
 * `buildFiltersWhere` la usa como campo de Prisma. Solo pasan las columnas reales de la tabla de candidatos.
 */
const ALLOWED_FILTER_KEYS = new Set<string>([
  'status',
  'hierarchy',
  'company_positions',
  'fullName',
  ...TEXT_FILTER_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set<string>(Object.values(pre_employee_status_enum));

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Select comun con todas las relaciones resueltas */
const PRE_EMPLOYEE_SELECT = {
  id: true,
  created_at: true,
  pre_file_number: true,
  status: true,
  lastname: true,
  firstname: true,
  document_number: true,
  cuil: true,
  phone: true,
  email: true,
  rejection_reason: true,
  reviewed_at: true,
  hierarchy: { select: { id: true, name: true } },
  company_positions: { select: { id: true, name: true } },
  // Documentos obligatorios ya cargados (para la barra de progreso X/Y)
  _count: {
    select: {
      // Misma regla que el checklist y que `getRequiredPreEmployeeDocumentsCount`: si el numerador
      // contara tipos que el denominador no, el avance podría salir 5/4.
      documents_pre_employees: {
        where: {
          document_types: { mandatory: true, is_active: true, available_for_pre_file: true, applies: 'Persona' },
        },
      },
    },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Descarta filtros ajenos a la tabla y valores que no son del tipo de la columna (enum / uuid). */
function sanitizeState(state: ReturnType<typeof parseSearchParams>) {
  const sanitized = sanitizeFilters(state, ALLOWED_FILTER_KEYS);
  const isValid = (key: string, value: string) => {
    if (key === 'status') return VALID_STATUSES.has(value);
    if (key === 'hierarchy' || key === 'company_positions') return value === NULL_FILTER_VALUE || UUID_PATTERN.test(value);
    return true;
  };

  const filters: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(sanitized.filters)) {
    const kept = values.filter((value) => isValid(key, value));
    if (kept.length > 0) filters[key] = kept;
  }
  return { ...sanitized, filters };
}

/**
 * Construye el WHERE clause compartido entre paginated, export y facets.
 * Todo va dentro de un único `AND`: el perímetro de empresa no se puede pisar ni se pierde el `AND` que
 * devuelve `buildFiltersWhere` cuando mezcla "Sin asignar" con valores.
 */
function buildWhereClause(
  companyId: string,
  rawState: ReturnType<typeof parseSearchParams>
): Prisma.pre_employeesWhereInput {
  const state = sanitizeState(rawState);

  const searchWhere = buildSearchWhere(state.search, [
    'pre_file_number',
    'lastname',
    'firstname',
    'document_number',
    'cuil',
  ]);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, 'fullName', ...dateRangeKeys(DATE_RANGE_COLUMNS)],
  });
  const { AND: filtersAnd, ...filtersRest } = filtersWhere as Prisma.pre_employeesWhereInput & {
    AND?: Prisma.pre_employeesWhereInput[];
  };

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS) as Prisma.pre_employeesWhereInput;
  const dateFiltersWhere = buildDateRangeFiltersWhere(
    state.filters,
    DATE_RANGE_COLUMNS
  ) as Prisma.pre_employeesWhereInput;

  // fullName necesita busqueda en multiples campos (lastname + firstname combinados)
  const fullNameFilter = state.filters['fullName']?.[0];
  const fullNameCondition = fullNameFilter
    ? [
        {
          OR: [
            { lastname: { contains: fullNameFilter, mode: 'insensitive' as const } },
            { firstname: { contains: fullNameFilter, mode: 'insensitive' as const } },
          ],
        },
      ]
    : [];

  return {
    AND: [
      { company_id: companyId },
      searchWhere as Prisma.pre_employeesWhereInput,
      filtersRest,
      ...(filtersAnd ?? []),
      textFiltersWhere,
      dateFiltersWhere,
      ...fullNameCondition,
    ],
  };
}

async function hasViewPermission() {
  return checkPermissionServer('seleccion', 'candidatos', 'view');
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPreEmployeesPaginated(searchParams: DataTableSearchParams) {
  if (!(await hasViewPermission())) throw new Error('No tenés permiso para ver candidatos');
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe orderBy: multi-sort, solo campos validos, con FK_SORT_MAP
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.pre_employees.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: PRE_EMPLOYEE_SELECT,
      }),
      prisma.pre_employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener candidatos paginados', { data: { error } });
    throw new Error(`Error al obtener los candidatos: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// REQUIRED DOCUMENTS COUNT
// ============================================================================

/**
 * Cantidad de tipos de documento obligatorios para un candidato (el "Y" de X/Y).
 * Misma regla que `getPreEmployeeDocumentChecklist`: tipos globales o de la empresa activa.
 */
export async function getRequiredPreEmployeeDocumentsCount() {
  if (!(await hasViewPermission())) throw new Error('No tenés permiso para ver candidatos');
  const companyId = await getActiveCompanyId();

  try {
    return await prisma.document_types.count({
      where: {
        available_for_pre_file: true,
        is_active: true,
        applies: 'Persona',
        mandatory: true,
        company_id: companyId,
      },
    });
  } catch (error) {
    logger.error('Error al contar documentos obligatorios de candidatos', { data: { error } });
    throw new Error('Error al contar los documentos obligatorios');
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllPreEmployeesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PreEmployeeListItem[]>> {
  if (!(await hasViewPermission())) return { ok: false, message: 'No tenés permiso para exportar candidatos' };
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    // Pide una fila de más para detectar que se pasó del tope sin traer la tabla entera
    const data = await prisma.pre_employees.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      where,
      select: PRE_EMPLOYEE_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (data.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar candidatos', { data: { error } });
    return { ok: false, message: 'Error al exportar los candidatos' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta funcion al abrirse.
 */
export async function getPreEmployeeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  if (!(await hasViewPermission())) throw new Error('No tenés permiso para ver candidatos');
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    return buildWhereClause(companyId, withoutOwnFilter(parsedState, excludeColumn));
  }

  try {
    const where = crossWhere(columnId);

    // ── Enum: status ──
    if (columnId === 'status') {
      const rows = await prisma.pre_employees.groupBy({ by: ['status'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.status as string, count: r._count }))),
      };
    }

    // ── FK UUID nullable: hierarchy / company_positions ──
    const FK_UUID_CONFIG: Record<
      string,
      {
        prismaField: string;
        resolver: (ids: string[]) => Promise<Array<{ id: string; name: string | null }>>;
      }
    > = {
      hierarchy: {
        prismaField: 'proposed_hierarchical_position',
        resolver: (ids) =>
          prisma.hierarchy.findMany({ where: { id: { in: ids }, company_id: companyId }, select: { id: true, name: true } }),
      },
      company_positions: {
        prismaField: 'proposed_company_position',
        resolver: (ids) =>
          prisma.company_positions.findMany({
            where: { id: { in: ids }, company_id: companyId },
            select: { id: true, name: true },
          }),
      },
    };

    if (columnId in FK_UUID_CONFIG) {
      const config = FK_UUID_CONFIG[columnId]!;
      const rows = await prisma.pre_employees.groupBy({
        by: [config.prismaField as 'proposed_hierarchical_position'],
        where,
        _count: true,
      });
      const counts = toFacetMap(
        rows.map((r) => ({
          key: (r as Record<string, unknown>)[config.prismaField] as string | null,
          count: r._count,
        }))
      );
      const ids = rows.map((r) => (r as Record<string, unknown>)[config.prismaField]).filter(Boolean) as string[];
      const resolvedOptions = ids.length > 0 ? await config.resolver(ids) : [];
      return { counts, resolvedOptions };
    }

    logger.warn('Facet column not recognized', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual', { data: { error, columnId } });
    return { counts: new Map<string, number>() };
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type PreEmployeeListItem = Awaited<ReturnType<typeof getPreEmployeesPaginated>>['data'][number];
