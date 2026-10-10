'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { pickFilters } from '@/features/Warehouses/lib/filters';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Treasury/Movements/MovementsList');

type MovementWhere = Prisma.treasury_movementsWhereInput;
type MovementOrderBy = Prisma.treasury_movementsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y los derivados se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['date', 'kind', 'description', 'created_at']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => MovementOrderBy[]> = {
  account: (dir) => [{ account: { name: dir } }],
  concept: (dir) => [{ concept: { name: dir } }],
  // Ingreso: de menor a mayor importe; Egreso: el importe viene negativo, asi que se invierte.
  income: (dir) => [{ amount: dir }],
  expense: (dir) => [{ amount: dir === 'asc' ? 'desc' : 'asc' }],
  state: (dir) => [{ cancelled_at: { sort: dir, nulls: 'first' } }],
};

const DATE_RANGE_COLUMNS = ['date', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['account', 'kind', 'concept'] as const;

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = {
  account: 'account_id',
  kind: 'kind',
  concept: 'concept_id',
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'movimientos', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero. */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = text.trim().replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

/** Numero de la orden de pago o de la transferencia de origen del movimiento. */
const originNumberContains = (value: string): MovementWhere => ({
  OR: [
    { payment_order_payment: { payment_order: { number: contains(value) } } },
    { transfer: { number: contains(value) } },
  ],
});

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): MovementWhere {
  const f = state.filters;
  const and: MovementWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { description: contains(search) },
        { account: { name: contains(search) } },
        { concept: { name: contains(search) } },
        originNumberContains(search),
      ],
    });
  }

  and.push(buildFiltersWhere(pickFilters(f, FACETED_COLUMNS), COLUMN_MAP) as MovementWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as MovementWhere);

  // Estado (derivado de cancelled_at): ambos valores = sin filtro
  const states = f.state ?? [];
  const wantsActive = states.includes('ACTIVE');
  const wantsCancelled = states.includes('CANCELLED');
  if (wantsActive && !wantsCancelled) and.push({ cancelled_at: null });
  if (wantsCancelled && !wantsActive) and.push({ cancelled_at: { not: null } });

  // Texto
  const description = f.description?.[0]?.trim();
  if (description) and.push({ description: contains(description) });

  const origin = f.origin?.[0]?.trim();
  if (origin) and.push(originNumberContains(origin));

  const cancelReason = f.cancel_reason?.[0]?.trim();
  if (cancelReason) and.push({ cancel_reason: contains(cancelReason) });

  // Importes (exactos): el ingreso es positivo y el egreso se guarda negativo
  const income = f.income?.[0]?.trim();
  if (income) {
    const amount = parseAmount(income);
    and.push(amount ? { amount } : { id: { in: [] } });
  }
  const expense = f.expense?.[0]?.trim();
  if (expense) {
    const amount = parseAmount(expense);
    and.push(amount ? { amount: amount.negated() } : { id: { in: [] } });
  }

  return { AND: and };
}

const MOVEMENT_SELECT = {
  id: true,
  date: true,
  amount: true,
  kind: true,
  description: true,
  created_at: true,
  cancelled_at: true,
  cancel_reason: true,
  account: { select: { id: true, name: true } },
  concept: { select: { id: true, name: true } },
  transfer: { select: { id: true, number: true } },
  payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
} as const;

function shape(rows: Prisma.treasury_movementsGetPayload<{ select: typeof MOVEMENT_SELECT }>[]) {
  return rows.map((r) => {
    const order = r.payment_order_payment?.payment_order ?? null;
    return {
      id: r.id,
      // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
      date: r.date.toISOString().slice(0, 10),
      amount: r.amount.toString(),
      kind: r.kind,
      description: r.description,
      created_at: r.created_at,
      cancelled: r.cancelled_at != null,
      cancel_reason: r.cancel_reason,
      account: { id: r.account.id, name: r.account.name },
      concept: r.concept ? { id: r.concept.id, name: r.concept.name } : null,
      transfer: r.transfer ? { id: r.transfer.id, number: r.transfer.number } : null,
      paymentOrder: order ? { id: order.id, number: order.number } : null,
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTreasuryMovementsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: MovementOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = SORT_MAP[s.id];
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: MovementOrderBy[] = [...resolvedSorts, { date: 'desc' }, { created_at: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.treasury_movements.findMany({ where, orderBy, skip, take, select: MOVEMENT_SELECT }),
      prisma.treasury_movements.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener movimientos de tesoreria', { data: { error } });
    throw new Error('No se pudo obtener la lista de movimientos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllTreasuryMovementsForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await prisma.treasury_movements.findMany({
      where,
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
      select: MOVEMENT_SELECT,
    });
    return shape(rows);
  } catch (error) {
    logger.error('Error al exportar movimientos de tesoreria', { data: { error } });
    throw new Error('No se pudo exportar la lista de movimientos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getTreasuryMovementSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): MovementWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
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
    // La columna 'state' es la unica cuyo id no coincide con el filtro de la URL
    const where = crossWhere(columnId);

    if (columnId === 'kind') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['kind'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.kind, count: r._count }))) };
    }

    if (columnId === 'state') {
      const [active, cancelled] = await Promise.all([
        prisma.treasury_movements.count({ where: { AND: [where, { cancelled_at: null }] } }),
        prisma.treasury_movements.count({ where: { AND: [where, { cancelled_at: { not: null } }] } }),
      ]);
      return {
        counts: new Map([
          ['ACTIVE', active],
          ['CANCELLED', cancelled],
        ]),
      };
    }

    if (columnId === 'account') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['account_id'], where, _count: true });
      const ids = rows.map((r) => r.account_id);
      const accounts = ids.length
        ? await prisma.treasury_accounts.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.account_id, count: r._count }))),
        resolvedOptions: accounts,
      };
    }

    if (columnId === 'concept') {
      const rows = await prisma.treasury_movements.groupBy({ by: ['concept_id'], where, _count: true });
      const ids = rows.flatMap((r) => (r.concept_id ? [r.concept_id] : []));
      const concepts = ids.length
        ? await prisma.treasury_concepts.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.concept_id, count: r._count }))),
        resolvedOptions: concepts,
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de movimientos de tesoreria', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type TreasuryMovementListItem = Awaited<ReturnType<typeof getTreasuryMovementsPaginated>>['data'][number];
