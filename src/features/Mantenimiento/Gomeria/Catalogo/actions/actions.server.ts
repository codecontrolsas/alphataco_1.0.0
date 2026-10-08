'use server';

import {
  assertTireBrandInActiveCompany,
  assertTireCatalogRefsInCompany,
  assertTireInActiveCompany,
  assertTireTypeInActiveCompany,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { applyTireStatusChange, createTiresWithStock, type NewTireRow } from '@/features/Warehouses/lib/tire-stock';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import { DECIMAL_RE, normalizeDecimal } from '@/features/Warehouses/schemas/stock-movement';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { TireRetreadLevel, TireStatus } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
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
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const logger = new Logger('features/Mantenimiento/Gomeria/Catalogo');

// ============================================================================
// TIRES CATALOG — CONSTANTS
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
    select: { vehicle: { select: { id: true, domain: true } } },
    take: 1,
  },
  /** Unidad de stock (Almacenes etapa 6): null = cubierta sin stock. */
  material_unit: { select: { id: true, status: true, warehouse: { select: { id: true, name: true } } } },
};

/** Sortable direct fields */
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

/** FK columns mapped to nested Prisma orderBy */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  brand_id: (dir) => ({ brand: { name: dir } }),
  tire_type_id: (dir) => ({ tire_type: { name: dir } }),
  warehouse: (dir) => ({ material_unit: { warehouse: { name: dir } } }),
};

/** Text filter columns */
const TEXT_FILTER_COLUMNS = ['serial_number'];

/** Date range columns */
const DATE_RANGE_COLUMNS = ['created_at'];

// ============================================================================
// INTERNAL WHERE BUILDER
// ============================================================================

/** Columnas virtuales que no son un campo de `tires`: se resuelven por relacion en `buildRelationFilters`. */
const RELATION_FILTER_COLUMNS = ['warehouse', 'tread_type', 'size', 'vehicle'];

/**
 * Filtros de columnas que viven en una relacion (deposito de la unidad, tipo, vehiculo montado).
 * `NULL_FILTER_VALUE` = "Sin asignar" / "Sin deposito".
 */
function buildRelationFilters(filters: Record<string, string[]>): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [];

  const warehouse = filters.warehouse ?? [];
  if (warehouse.length > 0) {
    const ids = warehouse.filter((v) => v !== NULL_FILTER_VALUE);
    const withNull = warehouse.includes(NULL_FILTER_VALUE);
    const or: Record<string, unknown>[] = [];
    if (ids.length > 0) or.push({ material_unit: { warehouse_id: { in: ids } } });
    // Sin deposito = sin unidad, o con unidad que no esta en un deposito (afuera / dada de baja).
    if (withNull) or.push({ material_unit: null }, { material_unit: { warehouse_id: null } });
    conditions.push({ OR: or });
  }

  const treadTypes = filters.tread_type ?? [];
  if (treadTypes.length > 0) conditions.push({ tire_type: { tread_type: { in: treadTypes } } });

  const size = filters.size?.[0];
  if (size) conditions.push({ tire_type: { size: { contains: size, mode: 'insensitive' } } });

  const vehicle = filters.vehicle ?? [];
  if (vehicle.length > 0) {
    const ids = vehicle.filter((v) => v !== NULL_FILTER_VALUE);
    const or: Record<string, unknown>[] = [];
    if (ids.length > 0) or.push({ vehicle_tire_positions: { some: { vehicle_id: { in: ids } } } });
    if (vehicle.includes(NULL_FILTER_VALUE)) or.push({ vehicle_tire_positions: { none: {} } });
    conditions.push({ OR: or });
  }

  return conditions;
}

function buildTiresWhereClause(state: ReturnType<typeof parseSearchParams>, companyId: string) {
  const searchWhere = buildSearchWhere(state.search, ['serial_number']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [
        ...TEXT_FILTER_COLUMNS,
        ...RELATION_FILTER_COLUMNS,
        ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      ],
    }
  );

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const andConditions = [
    ...((filtersWhere.AND as Record<string, unknown>[] | undefined) ?? []),
    ...buildRelationFilters(state.filters),
  ];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & {
    AND?: unknown;
  };

  return {
    company_id: companyId,
    is_active: true,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
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
  where: ReturnType<typeof buildTiresWhereClause>;
  skip?: number;
  take?: number;
  orderBy: Record<string, unknown>[];
}) {
  return prisma.tires.findMany({ ...args, select: TIRE_SELECT });
}

/**
 * Serializa la pagina para RSC -> cliente (tread_depth es Decimal) y, solo con `view_prices`,
 * agrega `unit_cost`: el `unit_cost` de la entrada mas reciente (direction = 1) de cada unidad.
 * Una sola query agrupada por los unit_id de la pagina (sin N+1). Sin permiso es siempre null.
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
    unit_cost: t.material_unit ? (costByUnit.get(t.material_unit.id) ?? null) : null,
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

/**
 * Catálogo de cubiertas del dashboard: la empresa sale de la sesión. Sin ese filtro el
 * listado mezclaba el stock de todas las empresas.
 */
export async function getTiresPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Fetching tires paginated');

  try {
    const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewTirePrices()]);
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildTiresWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }];

    const [raw, total] = await Promise.all([
      findTiresRaw({ where, skip, take, orderBy: safeOrderBy }),
      prisma.tires.count({ where }),
    ]);

    // Decimal -> number/string para RSC→Client; el costo solo viaja con view_prices
    const data = await serializeTires(raw, canViewPrices);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching tires paginated', { data: { error } });
    throw new Error(`Error al obtener las cubiertas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// EXPORT QUERY
// ============================================================================

export async function getTiresForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exporting tires');

  try {
    const [companyId, canViewPrices] = await Promise.all([getActiveCompanyId(), canViewTirePrices()]);
    const state = parseSearchParams(searchParams);
    const where = buildTiresWhereClause(state, companyId);

    const raw = await findTiresRaw({ where, orderBy: [{ created_at: 'desc' }] });

    return serializeTires(raw, canViewPrices);
  } catch (error) {
    logger.error('Error exporting tires', { data: { error } });
    throw new Error('Error al exportar las cubiertas');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

/**
 * Returns options and counts for a SINGLE faceted filter, with cross-filtering.
 * Called on-demand when a filter popover is opened.
 */
export async function getTireSingleFacet(
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

  const baseWhere = { company_id: companyId, is_active: true };

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
    return buildTiresWhereClause(modified, companyId);
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

    // ── Status enum (direct field on tires) ──
    if (columnId === 'status') {
      const rows = await prisma.tires.groupBy({
        by: ['status'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.status as string | null, count: r._count }))),
      };
    }

    // ── Retread level enum (direct field on tires, nullable) ──
    if (columnId === 'retread_level') {
      const rows = await prisma.tires.groupBy({
        by: ['retread_level'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.retread_level as string | null, count: r._count }))),
      };
    }

    // ── Tread type — via tire_type relation ──
    if (columnId === 'tread_type') {
      const grouped = await prisma.tires.groupBy({
        by: ['tire_type_id'],
        where,
        _count: true,
      });
      const typeIds = grouped.map((g) => g.tire_type_id).filter(Boolean) as string[];
      const types =
        typeIds.length > 0
          ? await prisma.tire_types.findMany({
              where: { id: { in: typeIds } },
              select: { id: true, tread_type: true },
            })
          : [];
      const typeMap = new Map(types.map((t) => [t.id, t.tread_type as string]));
      const finalCounts = new Map<string, number>();
      for (const g of grouped) {
        const tt = typeMap.get(g.tire_type_id);
        if (tt) {
          finalCounts.set(tt, (finalCounts.get(tt) ?? 0) + g._count);
        }
      }
      return { counts: finalCounts };
    }

    // ── Size — via tire_type relation ──
    if (columnId === 'size') {
      const grouped = await prisma.tires.groupBy({
        by: ['tire_type_id'],
        where,
        _count: true,
      });
      const typeIds = grouped.map((g) => g.tire_type_id).filter(Boolean) as string[];
      const types =
        typeIds.length > 0
          ? await prisma.tire_types.findMany({
              where: { id: { in: typeIds } },
              select: { id: true, size: true },
            })
          : [];
      const typeMap = new Map(types.map((t) => [t.id, t.size]));
      const finalCounts = new Map<string, number>();
      for (const g of grouped) {
        const sz = typeMap.get(g.tire_type_id);
        if (sz) {
          finalCounts.set(sz, (finalCounts.get(sz) ?? 0) + g._count);
        }
      }
      return { counts: finalCounts };
    }

    // ── Boolean: is_new ──
    if (columnId === 'is_new') {
      const rows = await prisma.tires.groupBy({ by: ['is_new'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: String(r.is_new), count: r._count }))),
      };
    }

    // ── FK UUID: brand_id ──
    if (columnId === 'brand_id') {
      const rows = await prisma.tires.groupBy({ by: ['brand_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.brand_id, count: r._count })));
      const ids = rows.map((r) => r.brand_id).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? await prisma.tire_brands.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK UUID: tire_type_id ──
    if (columnId === 'tire_type_id') {
      const rows = await prisma.tires.groupBy({ by: ['tire_type_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.tire_type_id, count: r._count })));
      const ids = rows.map((r) => r.tire_type_id).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? await prisma.tire_types.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── Warehouse of the stock unit (only IN_STOCK units have one; the rest is "Sin depósito") ──
    if (columnId === 'warehouse') {
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
      const resolvedOptions =
        ids.length > 0
          ? await prisma.warehouses.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── Vehicle (current installation) — derived via vehicle_tire_positions ──
    if (columnId === 'vehicle') {
      const tiresWithVehicles = await prisma.tires.findMany({
        where,
        select: {
          id: true,
          vehicle_tire_positions: {
            where: { tire_id: { not: null } },
            select: { vehicle: { select: { id: true, domain: true } } },
            take: 1,
          },
        },
      });

      const countMap = new Map<string, number>();
      for (const tire of tiresWithVehicles) {
        const vehicleId = tire.vehicle_tire_positions[0]?.vehicle?.id ?? null;
        if (vehicleId == null) {
          countMap.set(NULL_FILTER_VALUE, (countMap.get(NULL_FILTER_VALUE) ?? 0) + 1);
        } else {
          countMap.set(vehicleId, (countMap.get(vehicleId) ?? 0) + 1);
        }
      }

      const vehicleIds = [...countMap.keys()].filter((k) => k !== NULL_FILTER_VALUE);
      const resolvedOptions =
        vehicleIds.length > 0
          ? (
              await prisma.vehicles.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, domain: true },
              })
            ).map((v) => ({ id: v.id, name: v.domain }))
          : [];

      return { counts: countMap, resolvedOptions };
    }

    logger.warn('getTireSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error getting tire single facet', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================

interface NewTireData {
  serial_number: string;
  brand_id: string;
  tire_type_id: string;
  is_new: boolean;
  retread_level?: TireRetreadLevel | null;
  tread_depth?: number | null;
}

/** Deposito y costo unitario del alta: cada cubierta entra al stock (Almacenes etapa 6). */
interface TireStockData {
  warehouseId: string;
  unitCost: string;
}

/** Costo unitario validado y normalizado (hasta 4 decimales, punto o coma). */
function parseUnitCost(value: string): string | null {
  const trimmed = value.trim();
  return DECIMAL_RE.test(trimmed) ? normalizeDecimal(trimmed) : null;
}

/**
 * Alta de cubierta desde el catálogo del dashboard: la empresa sale de la sesión y ya no
 * llega como `company_id` del cliente. Entra al depósito elegido, al costo indicado.
 */
export async function createTire(data: NewTireData & TireStockData): Promise<ActionResult<{ id: string }>> {
  logger.debug('Creating tire', { data: { serial_number: data.serial_number } });
  const unitCost = parseUnitCost(data.unitCost);
  if (!unitCost) return fail('Indicá el costo unitario (hasta 4 decimales)');
  if (!data.serial_number.trim()) return fail('Indicá el número de serie');
  try {
    const [companyId, profile] = await Promise.all([getActiveCompanyId(), requireServerAuthProfile()]);
    await assertTireCatalogRefsInCompany(prisma, { brandId: data.brand_id, tireTypeId: data.tire_type_id }, companyId);
    await withActor(profile.credentialId, (tx) =>
      createTiresWithStock(tx, companyId, profile.id, {
        tires: [toTireRow({ ...data, serial_number: data.serial_number.trim() })],
        warehouseId: data.warehouseId,
        unitCost,
      })
    );
    const tire = await prisma.tires.findFirstOrThrow({
      where: { company_id: companyId, serial_number: data.serial_number.trim() },
      select: { id: true },
    });
    return ok({ id: tire.id });
  } catch (error) {
    return toGomeriaActionError(error, logger, 'dar de alta la cubierta');
  }
}

function toTireRow(data: NewTireData): NewTireRow {
  return {
    serial_number: data.serial_number,
    brand_id: data.brand_id,
    tire_type_id: data.tire_type_id,
    is_new: data.is_new,
    retread_level: data.retread_level ?? null,
    tread_depth: data.tread_depth ?? null,
  };
}

/**
 * Alta masiva desde el catálogo del dashboard: la empresa sale de la sesión y la marca y el
 * tipo tienen que ser de esa empresa. Una sola entrada al depósito con todas las series.
 */
export async function createTiresBulk(
  data: {
    prefix: string;
    rangeFrom: number;
    rangeTo: number;
    brand_id: string;
    tire_type_id: string;
    is_new: boolean;
    retread_level?: TireRetreadLevel | null;
    tread_depth?: number | null;
  } & TireStockData
): Promise<ActionResult<{ count: number }>> {
  logger.debug('Creating tires bulk', {
    data: { prefix: data.prefix, rangeFrom: data.rangeFrom, rangeTo: data.rangeTo },
  });

  const count = data.rangeTo - data.rangeFrom + 1;
  if (data.rangeFrom > data.rangeTo) return fail('El número inicial no puede ser mayor al número final.');
  if (count > 500) return fail(`El rango supera el máximo permitido (500). Se intentaron crear ${count} cubiertas.`);
  const unitCost = parseUnitCost(data.unitCost);
  if (!unitCost) return fail('Indicá el costo unitario (hasta 4 decimales)');

  try {
    const [companyId, profile] = await Promise.all([getActiveCompanyId(), requireServerAuthProfile()]);
    await assertTireCatalogRefsInCompany(prisma, { brandId: data.brand_id, tireTypeId: data.tire_type_id }, companyId);

    const serials = Array.from({ length: count }, (_, i) => `${data.prefix}${data.rangeFrom + i}`);
    const existing = await prisma.tires.findMany({
      where: { serial_number: { in: serials }, company_id: companyId },
      select: { serial_number: true },
    });
    if (existing.length > 0) {
      return fail(`Los siguientes números de serie ya existen: ${existing.map((t) => t.serial_number).join(', ')}`);
    }

    await withActor(
      profile.credentialId,
      (tx) =>
        createTiresWithStock(tx, companyId, profile.id, {
          tires: serials.map((serial_number) => toTireRow({ ...data, serial_number })),
          warehouseId: data.warehouseId,
          unitCost,
        }),
      prisma,
      { timeout: 30_000 }
    );
    return ok({ count });
  } catch (error) {
    return toGomeriaActionError(error, logger, 'dar de alta las cubiertas');
  }
}

export async function updateTire(
  id: string,
  data: {
    serial_number?: string;
    brand_id?: string;
    tire_type_id?: string;
    is_new?: boolean;
    retread_level?: TireRetreadLevel | null;
    tread_depth?: number | null;
  }
): Promise<ActionResult> {
  logger.debug('Updating tire', { data: { id } });
  try {
    await assertTireInActiveCompany(id);
    if (data.brand_id != null) await assertTireBrandInActiveCompany(data.brand_id);
    if (data.tire_type_id != null) await assertTireTypeInActiveCompany(data.tire_type_id);

    // Con stock, la serie, la marca y el tipo definen su material y su unidad: no se cambian.
    const current = await prisma.tires.findUniqueOrThrow({
      where: { id },
      select: { serial_number: true, brand_id: true, tire_type_id: true, material_unit_id: true },
    });
    const changesIdentity =
      (data.serial_number != null && data.serial_number !== current.serial_number) ||
      (data.brand_id != null && data.brand_id !== current.brand_id) ||
      (data.tire_type_id != null && data.tire_type_id !== current.tire_type_id);
    if (current.material_unit_id && changesIdentity) {
      return fail('La cubierta tiene stock: no se cambian la serie, la marca ni el tipo');
    }

    await prisma.tires.update({
      where: { id },
      data: {
        ...data,
        tread_depth: data.tread_depth ?? null,
        retread_level: data.retread_level ?? null,
      },
    });
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'actualizar la cubierta');
  }
}

/**
 * Cambio de estado desde el catálogo ("Marcar como reparada / encontrada"). Si la cubierta
 * tiene stock y vuelve a disponible, se devuelve al depósito elegido (o al único activo).
 */
export async function updateTireStatus(
  id: string,
  status: TireStatus,
  warehouseId: string | null = null
): Promise<ActionResult> {
  logger.debug('Updating tire status', { data: { id, status } });
  try {
    await assertTireInActiveCompany(id);
    const [companyId, profile] = await Promise.all([getActiveCompanyId(), requireServerAuthProfile()]);

    await withActor(profile.credentialId, async (tx) => {
      const current = await tx.tires.findUniqueOrThrow({ where: { id }, select: { status: true } });
      // Desde el catalogo solo se vuelve a disponible (reparada o encontrada) o se descarta: los
      // montajes y desmontajes van por la orden de gomeria, que es la que mueve el stock.
      const allowed: Partial<Record<TireStatus, TireStatus[]>> = {
        AVAILABLE: ['IN_REPAIR', 'MISSING'],
        DISCARDED: ['AVAILABLE', 'IN_REPAIR', 'MISSING'],
      };
      if (!allowed[status]?.includes(current.status)) {
        throw new StockError('INVALID_STATE', 'Ese cambio de estado se hace desde una orden de gomería');
      }
      await applyTireStatusChange(tx, companyId, profile.id, {
        tireId: id,
        from: current.status,
        to: status,
        warehouseId,
        notes: null,
      });
      await tx.tires.update({ where: { id }, data: { status } });
    }, prisma, GOMERIA_TX_OPTIONS);
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'cambiar el estado de la cubierta');
  }
}

export async function deleteTire(id: string): Promise<ActionResult> {
  logger.debug('Soft-deleting tire', { data: { id } });
  try {
    await assertTireInActiveCompany(id);

    const tire = await prisma.tires.findUniqueOrThrow({
      where: { id },
      select: { material_unit: { select: { status: true } } },
    });
    if (tire.material_unit && tire.material_unit.status !== 'DISCARDED') {
      return fail('Dala de baja con un descarte; tiene stock');
    }

    await prisma.tires.update({ where: { id }, data: { is_active: false } });
    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'eliminar la cubierta');
  }
}

/** Depósitos activos de la empresa, para el alta y para devolver cubiertas al stock. */
export async function getTireWarehousesForSelect() {
  const companyId = await getActiveCompanyId();
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

// ============================================================================
// HELPER: Get brands for forms (client-side selects)
// ============================================================================

/** Marcas de la empresa activa, para los formularios del dashboard. */
export async function getTireBrandsForSelect() {
  logger.debug('Fetching tire brands for select');
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.tire_brands.findMany({
      where: { company_id: companyId, is_active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  } catch (error) {
    logger.error('Error fetching tire brands for select', { data: { error } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type TireListItem = Awaited<ReturnType<typeof getTiresPaginated>>['data'][number];
