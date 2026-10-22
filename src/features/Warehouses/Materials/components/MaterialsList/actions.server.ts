'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
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
import { exportFailure, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import type { StockLevel } from '../../../lib/status-presentation';
import { getBelowMinimumMaterials } from '../../../lib/stock-levels';

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

/** Tope de filas de un export: más que esto se pide acotar con filtros. */
const MATERIALS_EXPORT_MAX_ROWS = 10_000;

/**
 * Claves de filtro que la tabla realmente usa; el resto de la URL se descarta antes de armar el `where`
 * (así `?company_id=...` o `?average_cost=...` no filtran nada).
 */
const ALLOWED_FILTER_KEYS = new Set([
  'category',
  'unit',
  'tracking_type',
  'requires_approval',
  'is_active',
  'below_min',
  'min_stock',
  ...TEXT_FILTER_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Columnas que NO pasan por `buildFiltersWhere` (texto, números, booleanos y calculados se resuelven aparte). */
const NON_FACETED_COLUMNS = [
  ...TEXT_FILTER_COLUMNS,
  'requires_approval',
  'is_active',
  'below_min',
  'min_stock',
  ...DATE_RANGE_COLUMNS,
];

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = { category: 'category_id', unit: 'unit_id' };

type ListState = ReturnType<typeof parseListState>;

function parseListState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

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
async function buildWhereClause(companyId: string, state: ListState): Promise<Prisma.materialsWhereInput> {
  const and: Prisma.materialsWhereInput[] = [{ company_id: companyId }];

  and.push(buildSearchWhere(state.search, ['code', 'name', 'description']) as Prisma.materialsWhereInput);
  and.push(
    buildFiltersWhere(state.filters, COLUMN_MAP, { exclude: NON_FACETED_COLUMNS }) as Prisma.materialsWhereInput
  );
  and.push(buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS) as Prisma.materialsWhereInput);
  and.push(buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.materialsWhereInput);

  // Booleanos: llegan como 'true' / 'false'
  const active = state.filters.is_active;
  // Ambos valores seleccionados = sin filtro
  if (active?.length === 1) and.push({ is_active: active[0] === 'true' });
  const approval = state.filters.requires_approval;
  if (approval?.length === 1) and.push({ requires_approval: approval[0] === 'true' });

  // Bajo mínimo (calculado, agotados incluidos): misma regla que Stock y la sub-navegación.
  const belowMin = state.filters.below_min;
  if (belowMin?.length === 1) {
    const underIds = (await getBelowMinimumMaterials(companyId)).map((m) => m.id);
    and.push({ id: belowMin[0] === 'true' ? { in: underIds } : { notIn: underIds } });
  }

  // Stock minimo (Decimal): contains no aplica; se busca el valor exacto.
  const minRaw = state.filters.min_stock?.[0]?.trim().replace(',', '.');
  if (minRaw) {
    const n = Number(minRaw);
    if (!Number.isNaN(n)) and.push({ min_stock: { equals: n } });
  }

  return { AND: and };
}

/** Decimal -> string y nivel de stock (frente al mínimo) antes de cruzar al cliente. */
async function shape<T extends { id: string; is_active: boolean; min_stock: { toString(): string } | null }>(
  companyId: string,
  rows: T[]
) {
  const below = new Map((await getBelowMinimumMaterials(companyId)).map((m) => [m.id, m.total]));
  return rows.map((row) => {
    const total = below.get(row.id);
    const stockLevel: StockLevel | null =
      total !== undefined
        ? new Prisma.Decimal(total).lte(0)
          ? 'OUT_OF_STOCK'
          : 'BELOW_MIN'
        : row.is_active && row.min_stock !== null
          ? 'OK'
          : null;
    return {
      ...row,
      min_stock: row.min_stock ? row.min_stock.toString() : null,
      below_min: total !== undefined,
      stock_level: stockLevel,
    };
  });
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
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state);

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
    return { data: await shape(companyId, rows), total };
  } catch (error) {
    logger.error('Error al obtener materiales', { data: { error } });
    throw new Error('No se pudo obtener la lista de materiales');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllMaterialsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<MaterialListItem[]>> {
  if (!(await checkPermissionServer('almacenes', 'materiales', 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los materiales.' };
  }
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);
    const where = await buildWhereClause(companyId, state);
    const rows = await fetchExportRowsInBatches({
      maxRows: MATERIALS_EXPORT_MAX_ROWS,
      listIds: (take) =>
        prisma.materials.findMany({
          where,
          orderBy: [{ is_active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
          select: { id: true },
          take,
        }),
      fetchByIds: (ids) =>
        prisma.materials.findMany({ where: { id: { in: ids }, company_id: companyId }, select: MATERIAL_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} materiales con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: await shape(companyId, rows) };
  } catch (error) {
    logger.error('Error al exportar materiales', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de materiales');
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

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  async function crossWhere(excludeColumn: string): Promise<Prisma.materialsWhereInput> {
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
    const where = await crossWhere(columnId);

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
    if (columnId === 'below_min') {
      const underIds = (await getBelowMinimumMaterials(companyId)).map((m) => m.id);
      const [under, total] = await Promise.all([
        prisma.materials.count({ where: { AND: [where, { id: { in: underIds } }] } }),
        prisma.materials.count({ where }),
      ]);
      return {
        counts: new Map([
          ['true', under],
          ['false', total - under],
        ]),
      };
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
