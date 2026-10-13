'use server';

import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
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

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, [
    'pre_file_number',
    'lastname',
    'firstname',
    'document_number',
    'cuil',
  ]);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, 'fullName', ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`])],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  // fullName necesita busqueda en multiples campos (lastname + firstname combinados).
  // Se agrega como condicion AND para no sobrescribir el OR de searchWhere.
  const fullNameFilter = state.filters['fullName']?.[0];
  const fullNameAndCondition: Record<string, unknown>[] = [];
  if (fullNameFilter) {
    fullNameAndCondition.push({
      OR: [
        { lastname: { contains: fullNameFilter, mode: 'insensitive' as const } },
        { firstname: { contains: fullNameFilter, mode: 'insensitive' as const } },
      ],
    });
  }

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Consolidar TODAS las condiciones AND para evitar que los spreads se sobrescriban entre si.
  // buildFiltersWhere puede generar AND (para mixed null+real values de hierarchy/company_positions),
  // fullNameAndCondition puede generar AND (para el filtro de nombre).
  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const allAndConditions = [...filtersWhereAndConditions, ...fullNameAndCondition];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & { AND?: unknown };

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPreEmployeesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
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
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }];

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
  const companyId = await getActiveCompanyId();

  try {
    return await prisma.document_types.count({
      where: {
        available_for_pre_file: true,
        is_active: true,
        applies: 'Persona',
        mandatory: true,
        OR: [{ company_id: null }, { company_id: companyId }],
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

export async function getAllPreEmployeesForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const data = await prisma.pre_employees.findMany({
      orderBy: [{ created_at: 'desc' }],
      where,
      select: PRE_EMPLOYEE_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar candidatos', { data: { error } });
    throw new Error('Error al exportar los candidatos');
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
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified);
  }

  function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
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
        resolver: (ids) => prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      company_positions: {
        prismaField: 'proposed_company_position',
        resolver: (ids) =>
          prisma.company_positions.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
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
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type PreEmployeeListItem = Awaited<ReturnType<typeof getPreEmployeesPaginated>>['data'][number];
