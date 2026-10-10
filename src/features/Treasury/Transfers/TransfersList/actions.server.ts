'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { pickFilters } from '@/features/Warehouses/lib/filters';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Treasury/Transfers/TransfersList');

type TransferWhere = Prisma.treasury_transfersWhereInput;
type TransferOrderBy = Prisma.treasury_transfersOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y los derivados se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['number', 'date', 'amount', 'notes', 'created_at']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => TransferOrderBy[]> = {
  from_account: (dir) => [{ from_account: { name: dir } }],
  to_account: (dir) => [{ to_account: { name: dir } }],
  state: (dir) => [{ cancelled_at: { sort: dir, nulls: 'first' } }],
};

const DATE_RANGE_COLUMNS = ['date', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['from_account', 'to_account'] as const;

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = {
  from_account: 'from_account_id',
  to_account: 'to_account_id',
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'transferencias', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero. */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = text.trim().replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m)).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): TransferWhere {
  const f = state.filters;
  const and: TransferWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { notes: contains(search) },
        { from_account: { name: contains(search) } },
        { to_account: { name: contains(search) } },
      ],
    });
  }

  and.push(buildFiltersWhere(pickFilters(f, FACETED_COLUMNS), COLUMN_MAP) as TransferWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as TransferWhere);

  // Estado (derivado de cancelled_at): ambos valores = sin filtro
  const states = f.state ?? [];
  const wantsActive = states.includes('ACTIVE');
  const wantsCancelled = states.includes('CANCELLED');
  if (wantsActive && !wantsCancelled) and.push({ cancelled_at: null });
  if (wantsCancelled && !wantsActive) and.push({ cancelled_at: { not: null } });

  // Texto
  const number = f.number?.[0]?.trim();
  if (number) and.push({ number: contains(number) });

  const notes = f.notes?.[0]?.trim();
  if (notes) and.push({ notes: contains(notes) });

  const cancelReason = f.cancel_reason?.[0]?.trim();
  if (cancelReason) and.push({ cancel_reason: contains(cancelReason) });

  // Importe (exacto)
  const amountText = f.amount?.[0]?.trim();
  if (amountText) {
    const amount = parseAmount(amountText);
    and.push(amount ? { amount } : { id: { in: [] } });
  }

  return { AND: and };
}

const TRANSFER_SELECT = {
  id: true,
  number: true,
  date: true,
  amount: true,
  notes: true,
  created_at: true,
  cancelled_at: true,
  cancel_reason: true,
  from_account: { select: { id: true, name: true } },
  to_account: { select: { id: true, name: true } },
} as const;

function shape(rows: Prisma.treasury_transfersGetPayload<{ select: typeof TRANSFER_SELECT }>[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
    date: r.date.toISOString().slice(0, 10),
    amount: r.amount.toString(),
    notes: r.notes,
    created_at: r.created_at,
    cancelled: r.cancelled_at != null,
    cancel_reason: r.cancel_reason,
    from_account: { id: r.from_account.id, name: r.from_account.name },
    to_account: { id: r.to_account.id, name: r.to_account.name },
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getTreasuryTransfersPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: TransferOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = SORT_MAP[s.id];
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: TransferOrderBy[] = [...resolvedSorts, { date: 'desc' }, { number: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.treasury_transfers.findMany({ where, orderBy, skip, take, select: TRANSFER_SELECT }),
      prisma.treasury_transfers.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener transferencias de tesoreria', { data: { error } });
    throw new Error('No se pudo obtener la lista de transferencias');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllTreasuryTransfersForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await prisma.treasury_transfers.findMany({
      where,
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      select: TRANSFER_SELECT,
    });
    return shape(rows);
  } catch (error) {
    logger.error('Error al exportar transferencias de tesoreria', { data: { error } });
    throw new Error('No se pudo exportar la lista de transferencias');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getTreasuryTransferSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): TransferWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  async function accountFacet(field: 'from_account_id' | 'to_account_id') {
    const where = crossWhere(field === 'from_account_id' ? 'from_account' : 'to_account');
    const rows = await prisma.treasury_transfers.groupBy({ by: [field], where, _count: true });
    const ids = rows.map((r) => r[field]);
    const accounts = ids.length
      ? await prisma.treasury_accounts.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return {
      counts: new Map(rows.map((r) => [r[field], r._count] as [string, number])),
      resolvedOptions: accounts,
    };
  }

  try {
    if (columnId === 'from_account') return await accountFacet('from_account_id');
    if (columnId === 'to_account') return await accountFacet('to_account_id');

    if (columnId === 'state') {
      const where = crossWhere('state');
      const [active, cancelled] = await Promise.all([
        prisma.treasury_transfers.count({ where: { AND: [where, { cancelled_at: null }] } }),
        prisma.treasury_transfers.count({ where: { AND: [where, { cancelled_at: { not: null } }] } }),
      ]);
      return {
        counts: new Map([
          ['ACTIVE', active],
          ['CANCELLED', cancelled],
        ]),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de transferencias de tesoreria', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type TreasuryTransferListItem = Awaited<ReturnType<typeof getTreasuryTransfersPaginated>>['data'][number];
