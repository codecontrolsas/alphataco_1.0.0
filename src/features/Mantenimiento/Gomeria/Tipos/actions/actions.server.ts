'use server';

import { assertTireTypeInActiveCompany } from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { TireTreadType } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { syncTireMaterials } from '@/features/Warehouses/lib/tire-materials';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Tipos');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'size', 'tread_type', 'is_active', 'created_at']);

const TEXT_FILTER_COLUMNS: string[] = ['name', 'size'];

const DATE_RANGE_COLUMNS = ['created_at'];

// ============================================================================
// INTERNAL WHERE BUILDER
// ============================================================================

function buildTireTypesWhereClause(state: ReturnType<typeof parseSearchParams>, companyId?: string) {
  const searchWhere = buildSearchWhere(state.search, ['name', 'size']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [...TEXT_FILTER_COLUMNS, ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`])],
    }
  );

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & { AND?: unknown };

  return {
    ...(companyId ? { company_id: companyId } : {}),
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...(filtersWhereAndConditions.length > 0 ? { AND: filtersWhereAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTireTypesPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Fetching tire types paginated');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildTireTypesWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        resolvedSorts.push({ [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_types.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: {
          id: true,
          name: true,
          size: true,
          tread_type: true,
          is_active: true,
          created_at: true,
          updated_at: true,
          _count: { select: { tires: true } },
        },
      }),
      prisma.tire_types.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tire types paginated', { data: { error } });
    throw new Error(
      `Error al obtener los tipos de cubierta: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// EXPORT QUERY
// ============================================================================

export async function getTireTypesForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exporting tire types');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = buildTireTypesWhereClause(state, companyId);

    const data = await prisma.tire_types.findMany({
      orderBy: [{ name: 'asc' }],
      where,
      select: {
        id: true,
        name: true,
        size: true,
        tread_type: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        _count: { select: { tires: true } },
      },
    });

    return data;
  } catch (error) {
    logger.error('Error exporting tire types', { data: { error } });
    throw new Error('Error al exportar los tipos de cubierta');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

export async function getTireTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  let companyId: string;
  try {
    companyId = await getActiveCompanyId();
  } catch {
    return null;
  }

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
    return buildTireTypesWhereClause(modified, companyId);
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

    // ── Boolean: is_active ─────────────────────────────────────────────────
    if (columnId === 'is_active') {
      const rows = await prisma.tire_types.groupBy({
        by: ['is_active'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: String(r.is_active), count: r._count }))),
      };
    }

    // ── Enum: tread_type ───────────────────────────────────────────────────
    if (columnId === 'tread_type') {
      const rows = await prisma.tire_types.groupBy({
        by: ['tread_type'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.tread_type, count: r._count }))),
      };
    }

    logger.warn('getTireTypeSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error getting tire type single facet', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================

/** Alta de tipo de cubierta: la empresa sale de la sesión, no del formulario. */
export async function createTireType(data: { name: string; size: string; tread_type: TireTreadType }) {
  logger.debug('Creating tire type', { data: { name: data.name, size: data.size } });
  try {
    const companyId = await getActiveCompanyId();
    const existing = await prisma.tire_types.findFirst({
      where: {
        size: data.size,
        tread_type: data.tread_type,
        company_id: companyId,
      },
    });
    if (existing) {
      throw new Error(`Ya existe un tipo de cubierta con medida "${data.size}" y tipo de banda "${data.tread_type}"`);
    }
    // Cada combinacion tipo + marca es un material de Almacenes (etapa 6): se crean juntos.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.create({ data: { ...data, company_id: companyId } });
      await syncTireMaterials(tx, companyId);
      return tireType;
    });
  } catch (error) {
    logger.error('Error creating tire type', { data: { error } });
    throw error;
  }
}

export async function updateTireType(id: string, data: { name?: string; size?: string; tread_type?: TireTreadType }) {
  logger.debug('Updating tire type', { data: { id, ...data } });
  try {
    await assertTireTypeInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.update({
        where: { id },
        data,
      });
      await syncTireMaterials(tx, tireType.company_id);
      return tireType;
    });
  } catch (error) {
    logger.error('Error updating tire type', { data: { error, id } });
    throw error;
  }
}

export async function toggleTireTypeActive(id: string, isActive: boolean) {
  logger.debug('Toggling tire type active', { data: { id, isActive } });
  try {
    await assertTireTypeInActiveCompany(id);

    // El nombre y el estado del material de cada combinacion siguen al tipo y a la marca.
    return await prisma.$transaction(async (tx) => {
      const tireType = await tx.tire_types.update({
        where: { id },
        data: { is_active: isActive },
      });
      await syncTireMaterials(tx, tireType.company_id);
      return tireType;
    });
  } catch (error) {
    logger.error('Error toggling tire type active', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// SELECT QUERY (for dropdowns in other forms)
// ============================================================================

/** Tipos de la empresa activa, para los formularios del dashboard. */
export async function getTireTypesForSelect() {
  logger.debug('Fetching tire types for select');
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.tire_types.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        name: true,
        size: true,
        tread_type: true,
      },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error fetching tire types for select', { data: { error } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type TireTypeListItem = Awaited<ReturnType<typeof getTireTypesPaginated>>['data'][number];
