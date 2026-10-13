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
import { EMPLOYEE_SELECT } from '@/shared/prisma-selects/employee-select';

const logger = new Logger('Employees/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla employees que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'lastname',
  'firstname',
  'email',
  'cuil',
  'document_number',
  'file',
  'born_date',
  'street',
  'street_number',
  'postal_code',
  'phone',
  'normal_hours',
  'date_of_admission',
  'created_at',
  'termination_date',
  'status',
  'gender',
  'nationality',
  'document_type',
  'marital_status',
  'level_of_education',
  'cost_type',
  'affiliate_status',
  'reason_for_termination',
  'is_active',
  // FK columns (sorted via FK_SORT_MAP)
  'hierarchy',
  'company_positions',
  'types_of_contract',
  'work_diagram',
  'category',
  'covenant',
  'guild',
  'cost_center',
  'countries',
  'province',
  'city',
]);

/**
 * Mapeo de columnId → orderBy de Prisma para columnas FK.
 * Las columnas FK necesitan { relation: { campo: dir } }.
 */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  hierarchy: (dir) => ({ hierarchy: { name: dir } }),
  company_positions: (dir) => ({ company_positions: { name: dir } }),
  types_of_contract: (dir) => ({ types_of_contract: { name: dir } }),
  work_diagram: (dir) => ({ work_diagram: { name: dir } }),
  category: (dir) => ({ category: { name: dir } }),
  covenant: (dir) => ({ covenant: { name: dir } }),
  guild: (dir) => ({ guild: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
  countries: (dir) => ({ countries: { name: dir } }),
  province: (dir) => ({ provinces: { name: dir } }),
  city: (dir) => ({ cities: { name: dir } }),
};

/** Params de URL que NO son filtros de la tabla (tabs de navegacion, etc.) */
const IGNORED_PARAMS = new Set(['tab', 'subtab']);

/** Columnas que son filtros de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = [
  'fullName',
  'email',
  'cuil',
  'document_number',
  'phone',
  'street',
  'street_number',
  'postal_code',
  'file',
  'normal_hours',
];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['date_of_admission', 'created_at', 'termination_date', 'born_date'];

/**
 * Mapping de columnId (URL) → campo real en Prisma
 * Solo para columnas cuyo ID en la URL difiere del campo en la BD
 */
const COLUMN_MAP: Record<string, string> = {
  hierarchy: 'hierarchical_position',
  company_positions: 'company_position',
  types_of_contract: 'type_of_contract',
  work_diagram: 'workflow_diagram',
  category: 'category_id',
  covenant: 'covenants_id',
  guild: 'guild_id',
  cost_center: 'cost_center_id',
  countries: 'birthplace',
};

/** Select comun con todas las relaciones resueltas */
// Definicion compartida con la API externa (ver @/shared/prisma-selects/employee-select)

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Construye el WHERE clause compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, isActive: boolean, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['lastname', 'firstname', 'cuil', 'file']);

  // Columnas manejadas manualmente (BigInt FK, M:M)
  const MANUALLY_HANDLED = ['province', 'city', 'contractor_employee', 'empleado_aptitudes', 'workshop_sectors'];
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS,
      ...MANUALLY_HANDLED,
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
    ],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS, {
    fullName: 'full_name',
  });

  // fullName necesita búsqueda en múltiples campos.
  // Se agrega como condición AND para no sobrescribir el OR de searchWhere.
  const fullNameFilter = state.filters['fullName']?.[0];
  const fullNameAndCondition: Record<string, unknown>[] = [];
  if (fullNameFilter) {
    fullNameAndCondition.push({
      OR: [
        { lastname: { contains: fullNameFilter, mode: 'insensitive' as const } },
        { firstname: { contains: fullNameFilter, mode: 'insensitive' as const } },
        { full_name: { contains: fullNameFilter, mode: 'insensitive' as const } },
      ],
    });
    // Quitar full_name de textFiltersWhere (ya se maneja arriba)
    delete (textFiltersWhere as Record<string, unknown>)['full_name'];
  }

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // BigInt FK filters (province, city) con soporte para null
  const bigintFilters: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  for (const field of ['province', 'city'] as const) {
    const values = state.filters[field];
    if (!values?.length) continue;
    const hasNull = values.includes(NULL_FILTER_VALUE);
    const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [{ [field]: { in: realValues.map((v) => BigInt(v)) } }, { [field]: null }],
      });
    } else if (hasNull) {
      bigintFilters[field] = null;
    } else {
      bigintFilters[field] = { in: realValues.map((v) => BigInt(v)) };
    }
  }

  // M:M filters con soporte para null
  const m2mFilters: Record<string, unknown> = {};

  const contractorValues = state.filters['contractor_employee'];
  if (contractorValues?.length) {
    const hasNull = contractorValues.includes(NULL_FILTER_VALUE);
    const realValues = contractorValues.filter((v) => v !== NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { contractor_employee: { some: { contractor_id: { in: realValues } } } },
          { contractor_employee: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilters.contractor_employee = { none: {} };
    } else {
      m2mFilters.contractor_employee = { some: { contractor_id: { in: realValues } } };
    }
  }

  const aptitudValues = state.filters['empleado_aptitudes'];
  if (aptitudValues?.length) {
    const hasNull = aptitudValues.includes(NULL_FILTER_VALUE);
    const realValues = aptitudValues.filter((v) => v !== NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { empleado_aptitudes: { some: { aptitud_id: { in: realValues } } } },
          { empleado_aptitudes: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilters.empleado_aptitudes = { none: {} };
    } else {
      m2mFilters.empleado_aptitudes = { some: { aptitud_id: { in: realValues } } };
    }
  }

  const workshopSectorValues = state.filters['workshop_sectors'];
  if (workshopSectorValues?.length) {
    const hasNull = workshopSectorValues.includes(NULL_FILTER_VALUE);
    const realValues = workshopSectorValues.filter((v) => v !== NULL_FILTER_VALUE);

    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [
          { employee_workshop_sectors: { some: { workshop_sector_id: { in: realValues } } } },
          { employee_workshop_sectors: { none: {} } },
        ],
      });
    } else if (hasNull) {
      m2mFilters.employee_workshop_sectors = { none: {} };
    } else {
      m2mFilters.employee_workshop_sectors = { some: { workshop_sector_id: { in: realValues } } };
    }
  }

  // Consolidar TODAS las condiciones AND para evitar que los spreads se sobrescriban entre sí.
  // buildFiltersWhere puede generar AND (para mixed null+real values),
  // fullNameAndCondition puede generar AND (para filtro de nombre),
  // extraAndConditions puede generar AND (para BigInt/M:M con mixed null+real values).
  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const allAndConditions = [...filtersWhereAndConditions, ...fullNameAndCondition, ...extraAndConditions];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & {
    AND?: unknown;
  };

  return {
    company_id: companyId,
    is_active: isActive,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...bigintFilters,
    ...m2mFilters,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getEmployeesPaginated(searchParams: DataTableSearchParams, isActive: boolean) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, isActive, state);

    // Safe orderBy: multi-sort, solo campos válidos, con FK_SORT_MAP
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { lastname: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.employees.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: EMPLOYEE_SELECT,
      }),
      prisma.employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener empleados paginados', { data: { error } });
    throw new Error(`Error al obtener los empleados: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

export async function getAllEmployeesForExport(searchParams: DataTableSearchParams, isActive: boolean) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const where = buildWhereClause(companyId, isActive, state);

    const data = await prisma.employees.findMany({
      orderBy: [{ lastname: 'asc' }],
      where,
      select: EMPLOYEE_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error al exportar empleados', { data: { error } });
    throw new Error('Error al exportar los empleados');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getEmployeeSingleFacet(
  columnId: string,
  isActive: boolean,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: isActive };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete parsedState.filters[key];
    }
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, isActive, modified);
  }

  function toFacetMap(rows: { key: string | bigint | null | undefined; count: number }[]): Map<string, number> {
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

    // ── Enum columns (direct field on employees) ──
    const ENUM_COLUMN_TO_FIELD: Record<string, string> = {
      status: 'status',
      gender: 'gender',
      nationality: 'nationality',
      document_type: 'document_type',
      marital_status: 'marital_status',
      level_of_education: 'level_of_education',
      cost_type: 'cost_type',
      affiliate_status: 'affiliate_status',
      reason_for_termination: 'reason_for_termination',
    };

    if (columnId in ENUM_COLUMN_TO_FIELD) {
      const field = ENUM_COLUMN_TO_FIELD[columnId]!;
      const rows = await prisma.employees.groupBy({
        by: [field as 'status'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({ key: (r as Record<string, unknown>)[field] as string | null, count: r._count }))
        ),
      };
    }

    // ── Boolean ──
    if (columnId === 'is_active') {
      const rows = await prisma.employees.groupBy({ by: ['is_active'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))),
      };
    }

    // ── FK UUID columns ──
    const FK_UUID_CONFIG: Record<
      string,
      {
        prismaField: string;
        resolver: (ids: string[]) => Promise<Array<{ id: string; name: string | null }>>;
      }
    > = {
      hierarchy: {
        prismaField: 'hierarchical_position',
        resolver: (ids) => prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      company_positions: {
        prismaField: 'company_position',
        resolver: (ids) =>
          prisma.company_positions.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      types_of_contract: {
        prismaField: 'type_of_contract',
        resolver: (ids) =>
          prisma.types_of_contract.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      work_diagram: {
        prismaField: 'workflow_diagram',
        resolver: (ids) =>
          prisma.work_diagram.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      category: {
        prismaField: 'category_id',
        resolver: (ids) => prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      covenant: {
        prismaField: 'covenants_id',
        resolver: (ids) => prisma.covenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      guild: {
        prismaField: 'guild_id',
        resolver: (ids) => prisma.guild.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      cost_center: {
        prismaField: 'cost_center_id',
        resolver: (ids) =>
          prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
      countries: {
        prismaField: 'birthplace',
        resolver: (ids) => prisma.countries.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      },
    };

    if (columnId in FK_UUID_CONFIG) {
      const config = FK_UUID_CONFIG[columnId]!;
      const rows = await prisma.employees.groupBy({
        by: [config.prismaField as 'hierarchical_position'],
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

    // ── FK BigInt columns ──
    if (columnId === 'province') {
      const rows = await prisma.employees.groupBy({ by: ['province'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.province, count: r._count })));
      const ids = rows.map((r) => r.province).filter(Boolean) as bigint[];
      const resolvedOptions =
        ids.length > 0
          ? (await prisma.provinces.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(
              (p) => ({ id: String(p.id), name: p.name })
            )
          : [];
      return { counts, resolvedOptions };
    }

    if (columnId === 'city') {
      const rows = await prisma.employees.groupBy({ by: ['city'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.city, count: r._count })));
      const ids = rows.map((r) => r.city).filter(Boolean) as bigint[];
      const resolvedOptions =
        ids.length > 0
          ? (await prisma.cities.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(
              (c) => ({ id: String(c.id), name: c.name })
            )
          : [];
      return { counts, resolvedOptions };
    }

    // ── M:M: contractor_employee ──
    if (columnId === 'contractor_employee') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.contractor_employee.findMany({
          where: { employees: where },
          select: { contractor_id: true, customers: { select: { id: true, name: true } } },
          distinct: ['contractor_id'],
        }),
        prisma.contractor_employee.findMany({
          where: { employees: where },
          select: { contractor_id: true },
        }),
        prisma.employees.count({ where }),
        prisma.employees.count({ where: { ...where, contractor_employee: { some: {} } } }),
      ]);

      const countMap = new Map<string, number>();
      for (const rel of allRels) {
        if (rel.contractor_id) {
          countMap.set(rel.contractor_id, (countMap.get(rel.contractor_id) ?? 0) + 1);
        }
      }
      const unassigned = totalInCross - withSome;
      if (unassigned > 0) countMap.set(NULL_FILTER_VALUE, unassigned);

      const resolvedOptions = relations
        .filter((r) => r.contractor_id && r.customers)
        .map((r) => ({ id: r.customers!.id, name: r.customers!.name }));

      return { counts: countMap, resolvedOptions };
    }

    // ── M:M: empleado_aptitudes ──
    if (columnId === 'empleado_aptitudes') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.empleado_aptitudes.findMany({
          where: { employees: where },
          select: { aptitud_id: true, aptitudes_tecnicas: { select: { id: true, nombre: true } } },
          distinct: ['aptitud_id'],
        }),
        prisma.empleado_aptitudes.findMany({
          where: { employees: where },
          select: { aptitud_id: true },
        }),
        prisma.employees.count({ where }),
        prisma.employees.count({ where: { ...where, empleado_aptitudes: { some: {} } } }),
      ]);

      const countMap = new Map<string, number>();
      for (const rel of allRels) {
        if (rel.aptitud_id) {
          countMap.set(rel.aptitud_id, (countMap.get(rel.aptitud_id) ?? 0) + 1);
        }
      }
      const unassigned = totalInCross - withSome;
      if (unassigned > 0) countMap.set(NULL_FILTER_VALUE, unassigned);

      const resolvedOptions = relations
        .filter((r) => r.aptitud_id && r.aptitudes_tecnicas)
        .map((r) => ({ id: r.aptitudes_tecnicas!.id, name: r.aptitudes_tecnicas!.nombre }));

      return { counts: countMap, resolvedOptions };
    }

    // ── M:M: employee_workshop_sectors ──
    if (columnId === 'workshop_sectors') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.employee_workshop_sectors.findMany({
          where: { employees: where },
          select: { workshop_sector_id: true, workshop_sectors: { select: { id: true, name: true } } },
          distinct: ['workshop_sector_id'],
        }),
        prisma.employee_workshop_sectors.findMany({
          where: { employees: where },
          select: { workshop_sector_id: true },
        }),
        prisma.employees.count({ where }),
        prisma.employees.count({ where: { ...where, employee_workshop_sectors: { some: {} } } }),
      ]);

      const countMap = new Map<string, number>();
      for (const rel of allRels) {
        if (rel.workshop_sector_id) {
          countMap.set(rel.workshop_sector_id, (countMap.get(rel.workshop_sector_id) ?? 0) + 1);
        }
      }
      const unassigned = totalInCross - withSome;
      if (unassigned > 0) countMap.set(NULL_FILTER_VALUE, unassigned);

      const resolvedOptions = relations
        .filter((r) => r.workshop_sector_id && r.workshop_sectors)
        .map((r) => ({ id: r.workshop_sectors!.id, name: r.workshop_sectors!.name }));

      return { counts: countMap, resolvedOptions };
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

/**
 * Resumen para las tarjetas del listado de activos: cuántos empleados hay en cada estado
 * documental. Una sola consulta agrupada (no un `count` por estado).
 */
export async function getEmployeeStatusMetrics() {
  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.employees.groupBy({
      by: ['status'],
      where: { company_id: companyId, is_active: true },
      _count: { _all: true },
    });

    const byStatus: Partial<Record<NonNullable<(typeof rows)[number]['status']>, number>> = {};
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      if (row.status) byStatus[row.status] = row._count._all;
    }

    return { total, byStatus };
  } catch (error) {
    logger.error('Error al obtener las métricas de empleados', { data: { error } });
    throw error;
  }
}

export type EmployeeListItem = Awaited<ReturnType<typeof getEmployeesPaginated>>['data'][number];
