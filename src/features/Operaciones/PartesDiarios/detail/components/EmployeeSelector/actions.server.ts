'use server';

import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import moment from 'moment';

const logger = new Logger('Operaciones/PartesDiarios/EmployeeSelector');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de la tabla employees que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set([
  'lastname',
  'firstname',
  'cuil',
  'document_number',
  'file',
  'email',
  'status',
  'gender',
  'nationality',
  'document_type',
  'affiliate_status',
  // FK columns (sorted via FK_SORT_MAP)
  'hierarchy',
  'company_positions',
  'work_diagram',
  'province',
]);

/** Mapping de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  hierarchy: (dir) => ({ hierarchy: { name: dir } }),
  company_positions: (dir) => ({ company_positions: { name: dir } }),
  work_diagram: (dir) => ({ work_diagram: { name: dir } }),
  province: (dir) => ({ provinces: { name: dir } }),
};

/** Columnas de texto libre */
const TEXT_FILTER_COLUMNS = ['file', 'cuil', 'document_number', 'email'];

/** Mapping de columnId (URL) → campo real en Prisma */
const COLUMN_MAP: Record<string, string> = {
  hierarchy: 'hierarchical_position',
  company_positions: 'company_position',
  work_diagram: 'workflow_diagram',
  status: 'status',
  gender: 'gender',
  nationality: 'nationality',
  document_type: 'document_type',
  affiliate_status: 'affiliate_status',
};

/** Columnas manejadas manualmente (BigInt FK, M:M) */
const MANUALLY_HANDLED = ['province', 'contractor_employee', 'empleado_aptitudes'];

// ============================================================================
// SELECT COMMON
// ============================================================================

function buildEmployeeSelectorSelect(reportDate?: string) {
  const day = reportDate ? Number(moment(reportDate).format('D')) : undefined;
  const month = reportDate ? Number(moment(reportDate).format('M')) : undefined;
  const year = reportDate ? Number(moment(reportDate).format('YYYY')) : undefined;

  return {
    id: true,
    lastname: true,
    firstname: true,
    file: true,
    cuil: true,
    document_type: true,
    document_number: true,
    gender: true,
    nationality: true,
    email: true,
    phone: true,
    status: true,
    normal_hours: true,
    affiliate_status: true,
    province: true,
    // FK relations
    hierarchy: { select: { id: true, name: true } },
    company_positions: { select: { id: true, name: true } },
    work_diagram: { select: { id: true, name: true } },
    provinces: { select: { id: true, name: true } },
    // M:M relations
    contractor_employee: {
      select: {
        contractor_id: true,
        customers: { select: { id: true, name: true } },
      },
    },
    empleado_aptitudes: {
      select: {
        aptitud_id: true,
        aptitudes_tecnicas: { select: { id: true, nombre: true } },
      },
    },
    // Diagram for the report date (deviation detection).
    // Always use the same select shape; filter by date when available.
    employees_diagram: {
      where: day != null && month != null && year != null ? { day, month, year } : { id: 'never' },
      take: 1,
      select: {
        id: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: {
          select: {
            id: true,
            name: true,
            work_active: true,
          },
        },
      },
    },
  } as const;
}

// ============================================================================
// WHERE CLAUSE HELPER (shared between paginated, facets)
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['lastname', 'firstname', 'file', 'cuil']);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, ...MANUALLY_HANDLED],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  // BigInt FK filter (province) with null support
  const bigintFilters: Record<string, unknown> = {};
  const extraAndConditions: Record<string, unknown>[] = [];

  const provinceValues = state.filters['province'];
  if (provinceValues?.length) {
    const hasNull = provinceValues.includes(NULL_FILTER_VALUE);
    const realValues = provinceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      extraAndConditions.push({
        OR: [{ province: { in: realValues.map((v) => BigInt(v)) } }, { province: null }],
      });
    } else if (hasNull) {
      bigintFilters['province'] = null;
    } else {
      bigintFilters['province'] = { in: realValues.map((v) => BigInt(v)) };
    }
  }

  // M:M: contractor_employee
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
      m2mFilters['contractor_employee'] = { none: {} };
    } else {
      m2mFilters['contractor_employee'] = { some: { contractor_id: { in: realValues } } };
    }
  }

  // M:M: empleado_aptitudes
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
      m2mFilters['empleado_aptitudes'] = { none: {} };
    } else {
      m2mFilters['empleado_aptitudes'] = { some: { aptitud_id: { in: realValues } } };
    }
  }

  // Consolidate AND conditions
  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const allAndConditions = [...filtersWhereAndConditions, ...extraAndConditions];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & { AND?: unknown };

  return {
    company_id: companyId,
    is_active: true,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...bigintFilters,
    ...m2mFilters,
    ...(allAndConditions.length > 0 ? { AND: allAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getActiveEmployeesPaginated(searchParams: DataTableSearchParams, reportDate?: string) {
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    // Safe multi-sort
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { lastname: 'asc' as const }];

    const selectClause = buildEmployeeSelectorSelect(reportDate);

    const [data, total] = await Promise.all([
      prisma.employees.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: selectClause,
      }),
      prisma.employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener empleados activos paginados', { data: { error } });
    throw new Error('Error al obtener empleados');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

export async function getEmployeeSelectorSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  _reportDate?: string
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere = { company_id: companyId, is_active: true };

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

    // ── Enum columns ──
    const ENUM_COLUMN_TO_FIELD: Record<string, string> = {
      status: 'status',
      gender: 'gender',
      nationality: 'nationality',
      document_type: 'document_type',
      affiliate_status: 'affiliate_status',
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
        resolver: (ids) =>
          prisma.hierarchy.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
      },
      company_positions: {
        prismaField: 'company_position',
        resolver: (ids) =>
          prisma.company_positions.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
      },
      work_diagram: {
        prismaField: 'workflow_diagram',
        resolver: (ids) =>
          prisma.work_diagram.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          }),
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

    // ── FK BigInt: province ──
    if (columnId === 'province') {
      const rows = await prisma.employees.groupBy({ by: ['province'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.province == null ? null : String(r.province), count: r._count })));
      const ids = rows.map((r) => r.province).filter(Boolean) as bigint[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.provinces.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            ).map((p) => ({ id: String(p.id), name: p.name }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── M:M: contractor_employee ──
    if (columnId === 'contractor_employee') {
      const [relations, allRels, totalInCross, withSome] = await Promise.all([
        prisma.contractor_employee.findMany({
          where: { employees: where },
          select: {
            contractor_id: true,
            customers: { select: { id: true, name: true } },
          },
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
          select: {
            aptitud_id: true,
            aptitudes_tecnicas: { select: { id: true, nombre: true } },
          },
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

    logger.warn('Facet column not recognized in employee selector', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual del selector de empleados', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type EmployeeSelectorItem = Awaited<ReturnType<typeof getActiveEmployeesPaginated>>['data'][number];
