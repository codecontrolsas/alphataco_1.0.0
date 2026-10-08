'use server';

import { pickFilters } from '../../../lib/filters';
import { checkPermissionServer } from '@/features/Permissions';
import type { Prisma } from '@/generated/prisma/client';
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

const logger = new Logger('features/Warehouses/Materials/MaterialsList');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set([
  'code',
  'name',
  'description',
  'tracking_type',
  'requires_approval',
  'min_stock',
  'is_active',
  'created_at',
  // FK (via FK_SORT_MAP)
  'category',
  'unit',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.materialsOrderByWithRelationInput> = {
  category: (dir) => ({ category: { name: dir } }),
  unit: (dir) => ({ unit: { name: dir } }),
};

const TEXT_FILTER_COLUMNS = ['code', 'name', 'description'];
const DATE_RANGE_COLUMNS = ['created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas, ver `lib/filters.ts`). */
const FACETED_COLUMNS = ['category', 'unit', 'tracking_type'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = { category: 'category_id', unit: 'unit_id' };

const MATERIAL_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  tracking_type: true,
  requires_approval: true,
  min_stock: true,
  is_active: true,
  created_at: true,
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, abbreviation: true } },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>): Prisma.materialsWhereInput {
  const and: Prisma.materialsWhereInput[] = [{ company_id: companyId }];

  and.push(buildSearchWhere(state.search, ['code', 'name', 'description']) as Prisma.materialsWhereInput);
  and.push(
    buildFiltersWhere(pickFilters(state.filters, FACETED_COLUMNS), COLUMN_MAP) as Prisma.materialsWhereInput
  );
  and.push(buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS) as Prisma.materialsWhereInput);
  and.push(buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.materialsWhereInput);

  // Booleanos: llegan como 'true' / 'false'
  const active = state.filters.is_active;
  // Ambos valores seleccionados = sin filtro
  if (active?.length === 1) and.push({ is_active: active[0] === 'true' });
  const approval = state.filters.requires_approval;
  if (approval?.length === 1) and.push({ requires_approval: approval[0] === 'true' });

  // Stock minimo (Decimal): contains no aplica; se busca el valor exacto.
  const minRaw = state.filters.min_stock?.[0]?.trim().replace(',', '.');
  if (minRaw) {
    const n = Number(minRaw);
    if (!Number.isNaN(n)) and.push({ min_stock: { equals: n } });
  }

  return { AND: and };
}

function serialize<T extends { min_stock: { toString(): string } | null }>(row: T) {
  // Decimal -> string antes de cruzar al cliente
  return { ...row, min_stock: row.min_stock ? row.min_stock.toString() : null };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getMaterialsPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) {
    return { data: [], total: 0 };
  }
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: Prisma.materialsOrderByWithRelationInput[] = [];
    for (const s of state.sorting) {
      if (!VALID_SORT_FIELDS.has(s.id) || s.id === 'is_active') continue;
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
    }
    // Inactivos SIEMPRE al final.
    const orderBy: Prisma.materialsOrderByWithRelationInput[] = [
      { is_active: 'desc' },
      ...resolvedSorts,
      { name: 'asc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.materials.findMany({ where, orderBy, skip, take, select: MATERIAL_SELECT }),
      prisma.materials.count({ where }),
    ]);
    return { data: rows.map(serialize), total };
  } catch (error) {
    logger.error('Error al obtener materiales', { data: { error } });
    throw new Error('No se pudo obtener la lista de materiales');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllMaterialsForExport(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) return [];
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await prisma.materials.findMany({
      where,
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      select: MATERIAL_SELECT,
    });
    return rows.map(serialize);
  } catch (error) {
    logger.error('Error al exportar materiales', { data: { error } });
    throw new Error('No se pudo exportar la lista de materiales');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getMaterialSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  function crossWhere(excludeColumn: string): Prisma.materialsWhereInput {
    if (!parsed) return { company_id: companyId };
    const filters = { ...parsed.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId, { ...parsed, filters });
  }

  function toFacetMap(rows: { key: string | boolean | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : String(key);
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'tracking_type') {
      const rows = await prisma.materials.groupBy({ by: ['tracking_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.tracking_type, count: r._count }))) };
    }
    if (columnId === 'requires_approval') {
      const rows = await prisma.materials.groupBy({ by: ['requires_approval'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.requires_approval, count: r._count }))) };
    }
    if (columnId === 'is_active') {
      const rows = await prisma.materials.groupBy({ by: ['is_active'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.is_active, count: r._count }))) };
    }
    if (columnId === 'category') {
      const rows = await prisma.materials.groupBy({ by: ['category_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.category_id, count: r._count })));
      const ids = rows.map((r) => r.category_id).filter((id): id is string => id != null);
      const resolvedOptions = ids.length
        ? await prisma.material_categories.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions };
    }
    if (columnId === 'unit') {
      const rows = await prisma.materials.groupBy({ by: ['unit_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.unit_id, count: r._count })));
      const ids = rows.map((r) => r.unit_id);
      const resolvedOptions = ids.length
        ? await prisma.measurement_units.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de materiales', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type MaterialListItem = Awaited<ReturnType<typeof getMaterialsPaginated>>['data'][number];
