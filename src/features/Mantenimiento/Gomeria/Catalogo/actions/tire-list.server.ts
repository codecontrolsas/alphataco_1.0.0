'use server';

import { requireGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { composeAnd, GOMERIA_EXPORT_MAX_ROWS } from '@/features/Mantenimiento/Gomeria/shared/list-query';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getBelowMinimumMaterials } from '@/features/Warehouses/lib/stock-levels';
import type { Prisma } from '@/generated/prisma/client';
import type { TireStatus, TireTreadType } from '@/generated/prisma/enums';
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
import { exportRowLimitMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';

/**
 * Listado del catálogo de cubiertas del dashboard (paginado, export y facetas).
 *
 * Lectura = `view` de la pestaña `catalogo_cubiertas` (módulo `mantenimiento`); el costo de la unidad
 * además exige `almacenes:movimientos:view_prices`. La empresa sale de la sesión.
 */

const logger = new Logger('features/Mantenimiento/Gomeria/Catalogo/list');

// ============================================================================
// CONSTANTS
// ============================================================================

const TIRE_SELECT = {
  id: true,
  serial_number: true,
  brand_id: true,
  tire_type_id: true,
  is_new: true,
  retread_level: true,
  tread_depth: true,
  status: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  discard_photo: true,
  discard_comment: true,
  discarded_at: true,
  brand: { select: { id: true, name: true } },
  tire_type: { select: { id: true, name: true, size: true, tread_type: true } },
  vehicle_tire_positions: {
    select: { axle_number: true, side: true, vehicle: { select: { id: true, domain: true } } },
    take: 1,
  },
  /** Unidad de stock (Almacenes etapa 6): null = cubierta sin stock. */
  material_unit: { select: { id: true, status: true, warehouse: { select: { id: true, name: true } } } },
} as const;

const VALID_SORT_FIELDS = new Set([
  'serial_number',
  'status',
  'is_new',
  'retread_level',
  'tread_depth',
  'created_at',
  'brand_id',
  'tire_type_id',
  'warehouse',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  brand_id: (dir) => ({ brand: { name: dir } }),
  tire_type_id: (dir) => ({ tire_type: { name: dir } }),
  warehouse: (dir) => ({ material_unit: { warehouse: { name: dir } } }),
};

/** Columnas con filtro de texto libre. `size` vive en el tipo de cubierta (relación). */
const TEXT_FILTER_COLUMNS = ['serial_number'];
const DATE_RANGE_COLUMNS = ['created_at'];

/** Columnas virtuales que no son un campo de `tires`: se resuelven por relación. */
const RELATION_FILTER_COLUMNS = ['warehouse', 'tread_type', 'size', 'vehicle'];

/** Únicas claves de filtro que la tabla entiende: el resto de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS = new Set([
  'status',
  'brand_id',
  'tire_type_id',
  'retread_level',
  'is_new',
  ...TEXT_FILTER_COLUMNS,
  ...RELATION_FILTER_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

type ListState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// WHERE
// ============================================================================

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/**
 * Filtros de columnas que viven en una relación (depósito de la unidad, tipo, vehículo montado).
 * `NULL_FILTER_VALUE` = "Sin asignar" / "Sin depósito".
 */
function buildRelationFilters(filters: Record<string, string[]>): Prisma.tiresWhereInput[] {
  const conditions: Prisma.tiresWhereInput[] = [];

  const warehouse = filters.warehouse ?? [];
  if (warehouse.length > 0) {
    const ids = warehouse.filter((v) => v !== NULL_FILTER_VALUE);
    const or: Prisma.tiresWhereInput[] = [];
    if (ids.length > 0) or.push({ material_unit: { warehouse_id: { in: ids } } });
    // Sin depósito = sin unidad, o con unidad que no está en un depósito (afuera / dada de baja).
    if (warehouse.includes(NULL_FILTER_VALUE))
      or.push({ material_unit: null }, { material_unit: { warehouse_id: null } });
    conditions.push({ OR: or });
  }

  const treadTypes = filters.tread_type ?? [];
  if (treadTypes.length > 0) {
    conditions.push({ tire_type: { tread_type: { in: treadTypes as TireTreadType[] } } });
  }

  const size = filters.size?.[0]?.trim();
  if (size) conditions.push({ tire_type: { size: { contains: size, mode: 'insensitive' } } });

  const vehicle = filters.vehicle ?? [];
  if (vehicle.length > 0) {
    const ids = vehicle.filter((v) => v !== NULL_FILTER_VALUE);
    const or: Prisma.tiresWhereInput[] = [];
    if (ids.length > 0) or.push({ vehicle_tire_positions: { some: { vehicle_id: { in: ids } } } });
    if (vehicle.includes(NULL_FILTER_VALUE)) or.push({ vehicle_tire_positions: { none: {} } });
    conditions.push({ OR: or });
  }

  return conditions;
}

/** Perímetro (empresa + activas), búsqueda y filtros dentro de UN solo `AND`. */
function buildWhereClause(state: ListState, companyId: string) {
  return composeAnd<Prisma.tiresWhereInput>(
    { company_id: companyId, is_active: true },
    buildSearchWhere(state.search, ['serial_number']),
    buildFiltersWhere(
      state.filters,
      {},
      {
        exclude: [...TEXT_FILTER_COLUMNS, ...RELATION_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)],
      }
    ),
    buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS),
    ...buildRelationFilters(state.filters)
  );
}

// ============================================================================
// STATUS COUNTS (tarjetas de métricas)
// ============================================================================

/**
 * Cubiertas por estado para las tarjetas del catálogo. Mismo universo que el listado sin filtros (empresa
 * activa y cubiertas activas, el perímetro de `buildWhereClause`) en una sola consulta agrupada.
 */
export async function getTireStatusCounts() {
  const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'view');

  try {
    const rows = await prisma.tires.groupBy({
      by: ['status'],
      where: buildWhereClause(parseListState({}), companyId),
      _count: true,
    });
    return Object.fromEntries(rows.map((row) => [row.status, row._count])) as Partial<Record<TireStatus, number>>;
  } catch (error) {
    logger.error('Error fetching tire status counts', { data: { error } });
    throw new Error('Error al obtener los totales de cubiertas');
  }
}

// ============================================================================
// ESTANTERÍA (conteo por medida y estado)
// ============================================================================

/**
 * Datos de la estantería isométrica: cubiertas por medida (`tire_types.size`) y estado, más lo que falta para
 * el mínimo de stock de cada medida. Mismo universo que el listado sin filtros. Tres consultas fijas, sin N+1:
 * conteo agrupado, medidas de esos tipos y (solo si hay materiales bajo mínimo) el vínculo material -> medida.
 * El faltante usa la regla única de Almacenes (`getBelowMinimumMaterials`): saldo total menor al mínimo.
 */
export async function getTireRackData() {
  const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'view');

  try {
    const [grouped, below] = await Promise.all([
      prisma.tires.groupBy({
        by: ['tire_type_id', 'status'],
        where: buildWhereClause(parseListState({}), companyId),
        _count: true,
      }),
      getBelowMinimumMaterials(companyId),
    ]);

    const links =
      below.length > 0
        ? await prisma.tire_materials.findMany({
            where: { company_id: companyId, material_id: { in: below.map((m) => m.id) } },
            select: { material_id: true, tire_type: { select: { size: true } } },
          })
        : [];
    const typeIds = [...new Set(grouped.map((g) => g.tire_type_id))];
    const types =
      typeIds.length > 0
        ? await prisma.tire_types.findMany({ where: { id: { in: typeIds } }, select: { id: true, size: true } })
        : [];

    const sizeByType = new Map(types.map((t) => [t.id, t.size]));
    const shelves = new Map<string, { size: string; counts: Partial<Record<TireStatus, number>>; shortage: number }>();
    const shelfOf = (size: string) => {
      let shelf = shelves.get(size);
      if (!shelf) shelves.set(size, (shelf = { size, counts: {}, shortage: 0 }));
      return shelf;
    };

    for (const row of grouped) {
      const size = sizeByType.get(row.tire_type_id);
      if (!size) continue;
      const shelf = shelfOf(size);
      shelf.counts[row.status] = (shelf.counts[row.status] ?? 0) + row._count;
    }

    const sizeByMaterial = new Map(links.map((l) => [l.material_id, l.tire_type.size]));
    for (const material of below) {
      const size = sizeByMaterial.get(material.id);
      if (!size) continue;
      shelfOf(size).shortage += Math.max(0, Math.ceil(Number(material.minStock) - Number(material.total)));
    }

    return [...shelves.values()].sort((a, b) => a.size.localeCompare(b.size, 'es', { numeric: true }));
  } catch (error) {
    logger.error('Error fetching tire rack data', { data: { error } });
    throw new Error('Error al obtener la estantería de cubiertas');
  }
}

// ============================================================================
// COST (view_prices)
// ============================================================================

/** El costo de la unidad solo sale del servidor con `almacenes:movimientos:view_prices`. */
async function canViewTirePrices() {
  return checkPermissionServer('almacenes', 'movimientos', 'view_prices');
}

type TireRaw = Awaited<ReturnType<typeof findTiresRaw>>[number];

function findTiresRaw(args: {
  where: ReturnType<typeof buildWhereClause>;
  skip?: number;
  take?: number;
  orderBy: Prisma.tiresOrderByWithRelationInput[];
}) {
  return prisma.tires.findMany({ ...args, select: TIRE_SELECT });
}

/**
 * Serializa la página para RSC -> cliente (tread_depth es Decimal) y, solo con `view_prices`,
 * agrega `unit_cost`: el `unit_cost` de la entrada más reciente (direction = 1) de cada unidad.
 * Una sola query agrupada por los unit_id de la página (sin N+1). Sin permiso es siempre null.
 */
async function serializeTires(raw: TireRaw[], canViewPrices: boolean) {
  const costByUnit = new Map<string, string>();
  const unitIds = canViewPrices ? raw.map((t) => t.material_unit?.id).filter((id): id is string => !!id) : [];
  if (unitIds.length > 0) {
    const lines = await prisma.stock_movement_lines.findMany({
      where: { unit_id: { in: unitIds }, direction: 1 },
      orderBy: [{ movement: { created_at: 'desc' } }, { id: 'desc' }],
      select: { unit_id: true, unit_cost: true },
    });
    for (const line of lines) {
      if (line.unit_id && !costByUnit.has(line.unit_id)) costByUnit.set(line.unit_id, line.unit_cost.toString());
    }
  }

  return raw.map((t) => ({
    ...t,
    tread_depth: t.tread_depth != null ? t.tread_depth.toNumber() : null,
    unit_cost: t.material_unit ? costByUnit.get(t.material_unit.id) ?? null : null,
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTiresPaginated(searchParams: DataTableSearchParams) {
  const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'view');

  try {
    const canViewPrices = await canViewTirePrices();
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(state, companyId);

    const resolvedSorts: Prisma.tiresOrderByWithRelationInput[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push((fkMapper ? fkMapper(dir) : { [s.id]: dir }) as Prisma.tiresOrderByWithRelationInput);
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [raw, total] = await Promise.all([
      findTiresRaw({ where, skip, take, orderBy: safeOrderBy }),
      prisma.tires.count({ where }),
    ]);

    // Decimal -> number/string para RSC→Client; el costo solo viaja con view_prices
    const data = await serializeTires(raw, canViewPrices);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tires paginated', { data: { error } });
    throw new Error('Error al obtener las cubiertas');
  }
}

export type TireListItem = Awaited<ReturnType<typeof getTiresPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (con tope)
// ============================================================================

export async function getTiresForExport(searchParams: DataTableSearchParams): Promise<ExportResult<TireListItem[]>> {
  let companyId: string;
  try {
    companyId = await requireGomeriaPermission('catalogo_cubiertas', 'view');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar las cubiertas' };
  }

  try {
    const canViewPrices = await canViewTirePrices();
    const where = buildWhereClause(parseListState(searchParams), companyId);

    const raw = await findTiresRaw({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      take: GOMERIA_EXPORT_MAX_ROWS + 1,
    });

    if (raw.length > GOMERIA_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(GOMERIA_EXPORT_MAX_ROWS, 'cubiertas') };
    }
    return { ok: true, data: await serializeTires(raw, canViewPrices) };
  } catch (error) {
    logger.error('Error exporting tires', { data: { error } });
    return { ok: false, message: 'Error al exportar las cubiertas' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

type FacetOption = { id: string; name: string | null };
type FacetResponse = { counts: Map<string, number>; resolvedOptions?: FacetOption[] };

const FACET_COLUMNS = [
  'status',
  'retread_level',
  'tread_type',
  'size',
  'is_new',
  'brand_id',
  'tire_type_id',
  'warehouse',
  'vehicle',
];

/** Cuenta cubiertas por `tire_type_id` y las agrupa por un atributo del tipo (banda o medida). */
async function countByTypeAttribute(where: Prisma.tiresWhereInput, attribute: 'tread_type' | 'size') {
  const grouped = await prisma.tires.groupBy({ by: ['tire_type_id'], where, _count: true });
  const typeIds = grouped.map((g) => g.tire_type_id);
  const types =
    typeIds.length > 0
      ? await prisma.tire_types.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, tread_type: true, size: true },
        })
      : [];
  const attributeByType = new Map(types.map((t) => [t.id, String(t[attribute])]));
  const counts = new Map<string, number>();
  for (const g of grouped) {
    const value = attributeByType.get(g.tire_type_id);
    if (value) counts.set(value, (counts.get(value) ?? 0) + g._count);
  }
  return counts;
}

/**
 * Options and counts for a SINGLE faceted filter, with cross-filtering.
 * Called on-demand when a filter popover is opened.
 */
export async function getTireSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResponse | null> {
  if (!FACET_COLUMNS.includes(columnId)) {
    logger.warn('getTireSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await requireGomeriaPermission('catalogo_cubiertas', 'view');
    const where = buildWhereClause(withoutOwnFilter(parseListState(searchParams ?? {}), columnId), companyId);

    switch (columnId) {
      case 'status': {
        const rows = await prisma.tires.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
      }
      case 'retread_level': {
        const rows = await prisma.tires.groupBy({ by: ['retread_level'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.retread_level, count: r._count }))) };
      }
      case 'tread_type':
        return { counts: await countByTypeAttribute(where, 'tread_type') };
      case 'size':
        return { counts: await countByTypeAttribute(where, 'size') };
      case 'is_new': {
        const rows = await prisma.tires.groupBy({ by: ['is_new'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: String(r.is_new), count: r._count }))) };
      }
      case 'brand_id': {
        const rows = await prisma.tires.groupBy({ by: ['brand_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.brand_id, count: r._count })));
        const ids = rows.map((r) => r.brand_id);
        const brands =
          ids.length > 0
            ? await prisma.tire_brands.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];
        return { counts, resolvedOptions: brands };
      }
      case 'tire_type_id': {
        const rows = await prisma.tires.groupBy({ by: ['tire_type_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.tire_type_id, count: r._count })));
        const ids = rows.map((r) => r.tire_type_id);
        const types =
          ids.length > 0
            ? await prisma.tire_types.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];
        return { counts, resolvedOptions: types };
      }
      case 'warehouse': {
        // Solo las unidades IN_STOCK tienen depósito; el resto es "Sin depósito".
        const [total, rows] = await Promise.all([
          prisma.tires.count({ where }),
          prisma.material_units.groupBy({
            by: ['warehouse_id'],
            where: { warehouse_id: { not: null }, tire: { is: where } },
            _count: true,
          }),
        ]);
        const counts = new Map<string, number>();
        let inWarehouse = 0;
        for (const r of rows) {
          if (r.warehouse_id) {
            counts.set(r.warehouse_id, r._count);
            inWarehouse += r._count;
          }
        }
        if (total - inWarehouse > 0) counts.set(NULL_FILTER_VALUE, total - inWarehouse);
        const ids = [...counts.keys()].filter((k) => k !== NULL_FILTER_VALUE);
        const warehouses =
          ids.length > 0
            ? await prisma.warehouses.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];
        return { counts, resolvedOptions: warehouses };
      }
      default: {
        // vehicle: instalación actual, derivada de las posiciones. groupBy en la base en vez de traer
        // todas las cubiertas con sus posiciones a memoria.
        const [rows, unassigned] = await Promise.all([
          prisma.vehicle_tire_positions.groupBy({
            by: ['vehicle_id'],
            where: { tire_id: { not: null }, tire: { is: where } },
            _count: true,
          }),
          prisma.tires.count({ where: { AND: [where, { vehicle_tire_positions: { none: {} } }] } }),
        ]);
        const counts = toFacetMap(rows.map((r) => ({ key: r.vehicle_id, count: r._count })));
        if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);
        const ids = rows.map((r) => r.vehicle_id);
        const vehicles =
          ids.length > 0
            ? await prisma.vehicles.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, domain: true },
                orderBy: { domain: 'asc' },
              })
            : [];
        return { counts, resolvedOptions: vehicles.map((v) => ({ id: v.id, name: v.domain })) };
      }
    }
  } catch (error) {
    logger.error('Error getting tire single facet', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
