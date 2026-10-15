'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { ExportResult } from '@/shared/lib/export-result';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { EXPIRING_WINDOW_DAYS } from '../../../lib/batch-expiry';
import { findExpiringBatches } from '../../../lib/expiring-batches';
import { getBelowMinimumMaterials } from '../../../lib/stock-levels';

const logger = new Logger('features/Warehouses/Stock/StockList');

// ============================================================================
// CONSTANTS
// ============================================================================

type StockWhere = Prisma.stock_balancesWhereInput;
type StockOrderBy = Prisma.stock_balancesOrderByWithRelationInput;

/**
 * Columnas ordenables server-side. NO ordenables: `below_min` y `valued` (calculadas: el
 * valorizado es cantidad x costo promedio, que Prisma no puede ordenar). `average_cost` solo
 * ordena si el usuario tiene `view_prices` (ordenar por un costo que no puede ver lo filtraria).
 */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => StockOrderBy> = {
  code: (dir) => ({ material: { code: dir } }),
  material: (dir) => ({ material: { name: dir } }),
  category: (dir) => ({ material: { category: { name: dir } } }),
  unit: (dir) => ({ material: { unit: { name: dir } } }),
  warehouse: (dir) => ({ warehouse: { name: dir } }),
  batch: (dir) => ({ batch: { batch_number: dir } }),
  expires_at: (dir) => ({ batch: { expires_at: dir } }),
  quantity: (dir) => ({ quantity: dir }),
};
const PRICE_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => StockOrderBy> = {
  average_cost: (dir) => ({ material: { average_cost: dir } }),
};

/** Mismo permiso de costos para las tres funciones (paginated, export, facets). */
async function canViewPrices(): Promise<boolean> {
  return checkPermissionServer('almacenes', 'stock', 'view_prices');
}

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

type FilterState = ReturnType<typeof parseSearchParams>;

/** Tope de filas del export (ver `fetchExportRowsInBatches`). */
const STOCK_EXPORT_MAX_ROWS = 10_000;

/**
 * Filtros que la tabla realmente usa. El resto de las claves de la URL se descarta antes de armar el
 * WHERE. `average_cost` solo entra con `view_prices`: filtrar por un costo que no se puede ver permitiria
 * deducirlo probando valores.
 */
const ALLOWED_FILTER_KEYS = [
  'code',
  'material',
  'quantity',
  'category',
  'unit',
  'warehouse',
  'batch',
  'below_min',
  ...dateRangeKeys(['expires_at']),
];

function parseListState(searchParams: DataTableSearchParams | undefined, withPrices: boolean): FilterState {
  const allowed = withPrices ? [...ALLOWED_FILTER_KEYS, 'average_cost'] : ALLOWED_FILTER_KEYS;
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), allowed);
}

/** Arma `OR` entre "valores reales" y "sin asignar" cuando el filtro trae el sentinel de null. */
function nullableIn(values: string[], build: (cond: { in: string[] } | null) => StockWhere): StockWhere {
  const real = values.filter((v) => v !== NULL_FILTER_VALUE);
  const parts: StockWhere[] = [];
  if (real.length) parts.push(build({ in: real }));
  if (values.includes(NULL_FILTER_VALUE)) parts.push(build(null));
  return parts.length === 1 ? parts[0]! : { OR: parts };
}

/** Ids de los materiales bajo su mínimo: la regla única de `lib/stock-levels.ts` (activos, agotados incluidos). */
async function getBelowMinMaterialIds(companyId: string): Promise<string[]> {
  return (await getBelowMinimumMaterials(companyId)).map((m) => m.id);
}

/** WHERE compartido entre paginated, export y facets. */
async function buildWhereClause(
  companyId: string,
  state: FilterState,
  options: { canViewPrices: boolean }
): Promise<StockWhere> {
  const f = state.filters;
  const and: StockWhere[] = [{ company_id: companyId }, { quantity: { gt: 0 } }];

  if (state.search) {
    and.push({
      OR: [
        { material: { code: contains(state.search) } },
        { material: { name: contains(state.search) } },
        { batch: { batch_number: contains(state.search) } },
      ],
    });
  }

  // Texto
  if (f.code?.[0]) and.push({ material: { code: contains(f.code[0]) } });
  if (f.material?.[0]) and.push({ material: { name: contains(f.material[0]) } });

  // Numericos (Decimal): contains no aplica; valor exacto
  const qty = Number(f.quantity?.[0]?.trim().replace(',', '.'));
  if (f.quantity?.[0] && !Number.isNaN(qty)) and.push({ quantity: { equals: qty } });
  if (options.canViewPrices && f.average_cost?.[0]) {
    const cost = Number(f.average_cost[0].trim().replace(',', '.'));
    if (!Number.isNaN(cost)) and.push({ material: { average_cost: { equals: cost } } });
  }

  // FK
  if (f.category?.length) and.push(nullableIn(f.category, (c) => ({ material: { category_id: c } })));
  if (f.unit?.length) and.push({ material: { unit_id: { in: f.unit } } });
  if (f.warehouse?.length) and.push({ warehouse_id: { in: f.warehouse } });
  if (f.batch?.length) and.push(nullableIn(f.batch, (c) => ({ batch_id: c })));

  // Vencimiento (dateRange sobre el lote)
  const expires = buildDateRangeFiltersWhere(f, ['expires_at']).expires_at as Prisma.DateTimeNullableFilter | undefined;
  if (expires) and.push({ batch: { expires_at: expires } });

  // Bajo minimo (calculado): 'true' / 'false'
  if (f.below_min?.length === 1) {
    const underIds = await getBelowMinMaterialIds(companyId);
    and.push({ material_id: f.below_min[0] === 'true' ? { in: underIds } : { notIn: underIds } });
  }

  return { AND: and };
}

const STOCK_SELECT = (withPrices: boolean) =>
  ({
    id: true,
    quantity: true,
    material: {
      select: {
        id: true,
        code: true,
        name: true,
        min_stock: true,
        // Sin view_prices el costo NO se selecciona: no sale de la base.
        average_cost: withPrices,
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, abbreviation: true } },
      },
    },
    warehouse: { select: { id: true, code: true, name: true } },
    batch: { select: { id: true, batch_number: true, expires_at: true } },
  }) as const;

/** Decimals -> string y valorizado; sin permiso, los costos van null. "Bajo mínimo" sale de la regla única. */
function shape(
  rows: Prisma.stock_balancesGetPayload<{ select: ReturnType<typeof STOCK_SELECT> }>[],
  belowMinIds: Set<string>,
  withPrices: boolean
) {
  return rows.map((r) => {
    const avg = withPrices ? String(r.material.average_cost) : null;
    return {
      id: r.id,
      quantity: r.quantity.toString(),
      material: {
        id: r.material.id,
        code: r.material.code,
        name: r.material.name,
        category: r.material.category,
        unit: r.material.unit,
      },
      warehouse: r.warehouse,
      batch: r.batch,
      below_min: belowMinIds.has(r.material.id),
      average_cost: avg,
      valued: avg != null ? r.quantity.mul(avg).toString() : null,
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getStockPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return { data: [], total: 0 };
  const [companyId, withPrices] = await Promise.all([getActiveCompanyId(), canViewPrices()]);

  try {
    const state = parseListState(searchParams, withPrices);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state, { canViewPrices: withPrices });

    const sortMap = withPrices ? { ...SORT_MAP, ...PRICE_SORT_MAP } : SORT_MAP;
    const orderBy: StockOrderBy[] = [];
    for (const s of state.sorting) {
      const mapper = sortMap[s.id];
      if (mapper) orderBy.push(mapper(s.desc ? 'desc' : 'asc'));
    }
    orderBy.push({ material: { name: 'asc' } }, { warehouse: { name: 'asc' } }, { id: 'asc' });

    const [rows, total, belowMin] = await Promise.all([
      prisma.stock_balances.findMany({ where, orderBy, skip, take, select: STOCK_SELECT(withPrices) }),
      prisma.stock_balances.count({ where }),
      getBelowMinimumMaterials(companyId),
    ]);
    return { data: shape(rows, new Set(belowMin.map((m) => m.id)), withPrices), total };
  } catch (error) {
    logger.error('Error al obtener stock', { data: { error } });
    throw new Error('No se pudo obtener el stock');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllStockForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<StockListItem[]>> {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar el stock.' };
  }
  const [companyId, withPrices] = await Promise.all([getActiveCompanyId(), canViewPrices()]);

  try {
    const state = parseListState(searchParams, withPrices);
    const where = await buildWhereClause(companyId, state, { canViewPrices: withPrices });
    const orderBy: StockOrderBy[] = [{ material: { name: 'asc' } }, { warehouse: { name: 'asc' } }, { id: 'asc' }];

    const [rows, belowMin] = await Promise.all([
      fetchExportRowsInBatches({
        maxRows: STOCK_EXPORT_MAX_ROWS,
        listIds: (take) => prisma.stock_balances.findMany({ where, orderBy, select: { id: true }, take }),
        fetchByIds: (ids) =>
          prisma.stock_balances.findMany({
            where: { id: { in: ids }, company_id: companyId },
            select: STOCK_SELECT(withPrices),
          }),
        tooLargeMessage: (maxRows) =>
          `Hay más de ${maxRows.toLocaleString('es-AR')} saldos con los filtros actuales. Acote la exportación con filtros.`,
      }),
      getBelowMinimumMaterials(companyId),
    ]);
    return { ok: true, data: shape(rows, new Set(belowMin.map((m) => m.id)), withPrices) };
  } catch (error) {
    logger.error('Error al exportar stock', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en producción.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError ? error.message : 'No se pudo exportar el stock. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getStockSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  // Los facets no usan costos: sin `average_cost` entre las claves permitidas.
  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams, false) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  async function crossWhere(excludeColumn: string): Promise<StockWhere> {
    const base: FilterState = parsed ?? parseListState({}, false);
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    delete filters[`${excludeColumn}_from`];
    delete filters[`${excludeColumn}_to`];
    // Los facets no usan costos: no hace falta el permiso para armar el WHERE.
    return buildWhereClause(companyId, { ...base, filters }, { canViewPrices: false });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  try {
    const where = await crossWhere(columnId);

    if (columnId === 'warehouse') {
      const rows = await prisma.stock_balances.groupBy({ by: ['warehouse_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.warehouse_id, count: r._count })));
      const ids = rows.map((r) => r.warehouse_id);
      const resolvedOptions = ids.length
        ? await prisma.warehouses.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions };
    }

    if (columnId === 'batch') {
      const rows = await prisma.stock_balances.groupBy({ by: ['batch_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.batch_id, count: r._count })));
      const ids = rows.map((r) => r.batch_id).filter((id): id is string => id != null);
      const batches = ids.length
        ? await prisma.material_batches.findMany({
            where: { id: { in: ids } },
            select: { id: true, batch_number: true },
            orderBy: { batch_number: 'asc' },
          })
        : [];
      return { counts, resolvedOptions: batches.map((b) => ({ id: b.id, name: b.batch_number })) };
    }

    // category / unit viven en el material: se agrupa por material y se reparte
    if (columnId === 'category' || columnId === 'unit') {
      const byMaterial = await prisma.stock_balances.groupBy({ by: ['material_id'], where, _count: true });
      const materials = byMaterial.length
        ? await prisma.materials.findMany({
            where: { id: { in: byMaterial.map((r) => r.material_id) } },
            select: { id: true, category_id: true, unit_id: true },
          })
        : [];
      const keyOf = new Map(
        materials.map((m) => [m.id, columnId === 'category' ? m.category_id : m.unit_id] as const)
      );
      const counts = toFacetMap(byMaterial.map((r) => ({ key: keyOf.get(r.material_id) ?? null, count: r._count })));
      const ids = [...new Set([...keyOf.values()].filter((id): id is string => id != null))];
      const resolvedOptions = !ids.length
        ? []
        : columnId === 'category'
          ? await prisma.material_categories.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : await prisma.measurement_units.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            });
      return { counts, resolvedOptions };
    }

    if (columnId === 'below_min') {
      const underIds = await getBelowMinMaterialIds(companyId);
      const [under, total] = await Promise.all([
        prisma.stock_balances.count({ where: { AND: [where, { material_id: { in: underIds } }] } }),
        prisma.stock_balances.count({ where }),
      ]);
      return {
        counts: new Map([
          ['true', under],
          ['false', total - under],
        ]),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de stock', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCIÓN: bajo mínimo y lotes vencidos / por vencer
// ============================================================================

/**
 * Datos de la banda y las tarjetas de Stock. Nunca rechaza: devuelve `null` si no hay permiso o si no se
 * pudo calcular (la banda simplemente no se muestra, nunca un 0 inventado).
 *
 * - `belowMin`: materiales (no filas de la tabla) bajo su mínimo, agotados incluidos: el mismo número que el
 *   contador de la sub-navegación (`lib/stock-levels.ts`).
 * - `expired` / `expiring`: lotes con saldo (mismas filas que la tabla filtrada por vencimiento hasta
 *   `expiringUntil`).
 * - `valued`: valorizado total, SOLO con `view_prices` (sin permiso ni se calcula ni viaja).
 */
export async function getStockAttention() {
  try {
    if (!(await checkPermissionServer('almacenes', 'stock', 'view'))) return null;
    const [companyId, withPrices] = await Promise.all([getActiveCompanyId(), canViewPrices()]);
    const today = argentinaDate();
    const limit = new Date(`${today}T00:00:00.000Z`);
    limit.setUTCDate(limit.getUTCDate() + EXPIRING_WINDOW_DAYS);

    const [belowMin, batches, valuedRows] = await Promise.all([
      getBelowMinimumMaterials(companyId),
      findExpiringBatches(companyId, today),
      withPrices
        ? prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>(
            Prisma.sql`SELECT COALESCE(SUM(sb.quantity * m.average_cost), 0) AS total
              FROM stock_balances sb JOIN materials m ON m.id = sb.material_id
              WHERE sb.company_id = ${companyId}::uuid AND sb.quantity > 0`
          )
        : Promise.resolve(null),
    ]);

    const expired = batches.filter((b) => b.status === 'EXPIRED').length;
    return {
      belowMin: belowMin.length,
      expired,
      expiring: batches.length - expired,
      /** `YYYY-MM-DD`: tope del filtro de Vencimiento que muestra exactamente estos lotes. */
      expiringUntil: limit.toISOString().slice(0, 10),
      valued: valuedRows ? String(valuedRows[0]?.total ?? 0) : null,
    };
  } catch (error) {
    logger.error('Error al calcular la atención de stock', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type StockListItem = Awaited<ReturnType<typeof getStockPaginated>>['data'][number];
