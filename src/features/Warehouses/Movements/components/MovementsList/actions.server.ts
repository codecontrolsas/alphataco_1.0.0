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
import { DESTINATION_SELECT, destinationLabel } from '../../../lib/labels';

const logger = new Logger('features/Warehouses/Movements/MovementsList');

/** Estado calculado de anulacion: se deduce de `reversed_by` / `reverses_movement_id`. */
export type MovementReversalStatus = 'VALID' | 'REVERSED' | 'REVERSAL';

type MovementWhere = Prisma.stock_movementsWhereInput;
type MovementOrderBy = Prisma.stock_movementsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Campos directos ordenables. NO ordenables: `destination` y `status` (calculados desde
 * varias relaciones). `total_cost` solo con view_prices.
 */
const VALID_SORT_FIELDS = new Set([
  'number',
  'type',
  'occurred_on',
  'destination_type',
  'reference',
  'notes',
  'created_at',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => MovementOrderBy> = {
  warehouse: (dir) => ({ warehouse: { name: dir } }),
  target_warehouse: (dir) => ({ target_warehouse: { name: dir } }),
  created_by: (dir) => ({ creator: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number', 'reference', 'notes'];
const DATE_RANGE_COLUMNS = ['occurred_on', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas, ver `lib/filters.ts`). */
const FACETED_COLUMNS = ['type', 'warehouse', 'target_warehouse', 'destination_type', 'created_by'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  warehouse: 'warehouse_id',
  target_warehouse: 'target_warehouse_id',
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

async function canViewPrices(): Promise<boolean> {
  return checkPermissionServer('almacenes', 'movimientos', 'view_prices');
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(
  companyId: string,
  state: FilterState,
  options: { canViewPrices: boolean }
): MovementWhere {
  const f = state.filters;
  const and: MovementWhere[] = [{ company_id: companyId }];

  and.push(buildSearchWhere(state.search, ['number', 'reference']) as MovementWhere);
  and.push(
    buildFiltersWhere(pickFilters(f, FACETED_COLUMNS), COLUMN_MAP) as MovementWhere
  );
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as MovementWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as MovementWhere);

  // Destino (texto): busca en la relacion que corresponda al tipo de destino
  const dest = f.destination?.[0]?.trim();
  if (dest) {
    and.push({
      OR: [
        { employee: { OR: [{ file: contains(dest) }, { lastname: contains(dest) }, { firstname: contains(dest) }] } },
        { vehicle: { OR: [{ domain: contains(dest) }, { intern_number: contains(dest) }] } },
        { other_equipment: { intern_number: contains(dest) } },
        { maintenance_order: { order_number: contains(dest) } },
        { customer: { name: contains(dest) } },
      ],
    });
  }

  // Estado de anulacion (calculado). Si estan los tres seleccionados no filtra.
  const statuses = (f.status ?? []) as MovementReversalStatus[];
  if (statuses.length > 0 && statuses.length < 3) {
    const byStatus: Record<MovementReversalStatus, MovementWhere> = {
      REVERSED: { reversed_by: { isNot: null } },
      REVERSAL: { reverses_movement_id: { not: null } },
      VALID: { AND: [{ reversed_by: { is: null } }, { reverses_movement_id: null }] },
    };
    and.push({ OR: statuses.filter((s) => s in byStatus).map((s) => byStatus[s]) });
  }

  // Total (Decimal): valor exacto, solo con view_prices
  if (options.canViewPrices && f.total_cost?.[0]) {
    const n = Number(f.total_cost[0].trim().replace(',', '.'));
    if (!Number.isNaN(n)) and.push({ total_cost: { equals: n } });
  }

  return { AND: and };
}

const MOVEMENT_SELECT = (withPrices: boolean) =>
  ({
    id: true,
    number: true,
    type: true,
    occurred_on: true,
    reference: true,
    notes: true,
    created_at: true,
    reverses_movement_id: true,
    // Sin view_prices el total NO se selecciona: no sale de la base.
    total_cost: withPrices,
    warehouse: { select: { id: true, name: true } },
    target_warehouse: { select: { id: true, name: true } },
    creator: { select: { id: true, fullname: true, email: true } },
    reversed_by: { select: { id: true } },
    ...DESTINATION_SELECT,
  }) as const;

function shape(
  rows: Prisma.stock_movementsGetPayload<{ select: ReturnType<typeof MOVEMENT_SELECT> }>[],
  withPrices: boolean
) {
  return rows.map((r) => {
    const status: MovementReversalStatus = r.reversed_by
      ? 'REVERSED'
      : r.reverses_movement_id
        ? 'REVERSAL'
        : 'VALID';
    return {
      id: r.id,
      number: r.number,
      type: r.type,
      occurred_on: r.occurred_on,
      reference: r.reference,
      notes: r.notes,
      created_at: r.created_at,
      warehouse: r.warehouse,
      target_warehouse: r.target_warehouse,
      destination_type: r.destination_type,
      destination: destinationLabel(r),
      status,
      creator: { id: r.creator.id, name: r.creator.fullname ?? r.creator.email ?? '-' },
      total_cost: withPrices ? r.total_cost.toString() : null,
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getMovementsPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'view'))) return { data: [], total: 0 };
  const [companyId, withPrices] = await Promise.all([getActiveCompanyId(), canViewPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state, { canViewPrices: withPrices });

    const resolvedSorts: MovementOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id) || (withPrices && s.id === 'total_cost')) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: MovementOrderBy[] = [...resolvedSorts, { created_at: 'desc' }, { id: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.stock_movements.findMany({ where, orderBy, skip, take, select: MOVEMENT_SELECT(withPrices) }),
      prisma.stock_movements.count({ where }),
    ]);
    return { data: shape(rows, withPrices), total };
  } catch (error) {
    logger.error('Error al obtener movimientos', { data: { error } });
    throw new Error('No se pudo obtener la lista de movimientos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllMovementsForExport(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'view'))) return [];
  const [companyId, withPrices] = await Promise.all([getActiveCompanyId(), canViewPrices()]);

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state, { canViewPrices: withPrices });
    const rows = await prisma.stock_movements.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: MOVEMENT_SELECT(withPrices),
    });
    return shape(rows, withPrices);
  } catch (error) {
    logger.error('Error al exportar movimientos', { data: { error } });
    throw new Error('No se pudo exportar la lista de movimientos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getMovementSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (!(await checkPermissionServer('almacenes', 'movimientos', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): MovementWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
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

  async function resolveWarehouses(ids: string[]) {
    return ids.length
      ? prisma.warehouses.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'type') {
      const rows = await prisma.stock_movements.groupBy({ by: ['type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.type, count: r._count }))) };
    }

    if (columnId === 'destination_type') {
      const rows = await prisma.stock_movements.groupBy({ by: ['destination_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.destination_type, count: r._count }))) };
    }

    if (columnId === 'warehouse') {
      const rows = await prisma.stock_movements.groupBy({ by: ['warehouse_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.warehouse_id, count: r._count })));
      return { counts, resolvedOptions: await resolveWarehouses(rows.map((r) => r.warehouse_id)) };
    }

    if (columnId === 'target_warehouse') {
      const rows = await prisma.stock_movements.groupBy({ by: ['target_warehouse_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.target_warehouse_id, count: r._count })));
      const ids = rows.map((r) => r.target_warehouse_id).filter((id): id is string => id != null);
      return { counts, resolvedOptions: await resolveWarehouses(ids) };
    }

    if (columnId === 'created_by') {
      const rows = await prisma.stock_movements.groupBy({ by: ['created_by'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count })));
      const ids = rows.map((r) => r.created_by);
      const profiles = ids.length
        ? await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullname: true, email: true },
            orderBy: { fullname: 'asc' },
          })
        : [];
      return { counts, resolvedOptions: profiles.map((p) => ({ id: p.id, name: p.fullname ?? p.email ?? '-' })) };
    }

    if (columnId === 'status') {
      const [reversed, reversal, valid] = await Promise.all([
        prisma.stock_movements.count({ where: { AND: [where, { reversed_by: { isNot: null } }] } }),
        prisma.stock_movements.count({ where: { AND: [where, { reverses_movement_id: { not: null } }] } }),
        prisma.stock_movements.count({
          where: { AND: [where, { reversed_by: { is: null } }, { reverses_movement_id: null }] },
        }),
      ]);
      return {
        counts: new Map([
          ['VALID', valid],
          ['REVERSED', reversed],
          ['REVERSAL', reversal],
        ]),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de movimientos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type MovementListItem = Awaited<ReturnType<typeof getMovementsPaginated>>['data'][number];
