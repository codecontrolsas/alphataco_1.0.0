'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isoDay } from '../../lib/dates';
import {
  buildTreasuryDateRangeWhere,
  facetWhere,
  ownEntry,
  parseAmountText,
  safePaging,
  textValue,
} from '../../lib/filter-values';

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

/** `date` es @db.Date; `created_at` es timestamptz (el dia elegido es el dia argentino). */
const DATE_COLUMNS = ['date'];
const TIMESTAMP_COLUMNS = ['created_at'];

/** Tope de filas por export de esta tabla. */
const EXPORT_LIMIT = 10_000;

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

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero o no entra en numeric(15,2). */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = parseAmountText(text);
  return normalized ? new Prisma.Decimal(normalized) : null;
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): TransferWhere {
  const f = state.filters;
  const and: TransferWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
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

  const fromAccount = facetWhere('from_account_id', f.from_account, { kind: 'uuid' });
  if (fromAccount) and.push(fromAccount as TransferWhere);
  const toAccount = facetWhere('to_account_id', f.to_account, { kind: 'uuid' });
  if (toAccount) and.push(toAccount as TransferWhere);
  and.push(
    buildTreasuryDateRangeWhere(f, { dateColumns: DATE_COLUMNS, timestampColumns: TIMESTAMP_COLUMNS }) as TransferWhere
  );

  // Estado (derivado de cancelled_at): ambos valores = sin filtro
  const states = f.state ?? [];
  const wantsActive = states.includes('ACTIVE');
  const wantsCancelled = states.includes('CANCELLED');
  if (wantsActive && !wantsCancelled) and.push({ cancelled_at: null });
  if (wantsCancelled && !wantsActive) and.push({ cancelled_at: { not: null } });

  // Texto
  const number = textValue(f.number?.[0]);
  if (number) and.push({ number: contains(number) });

  const notes = textValue(f.notes?.[0]);
  if (notes) and.push({ notes: contains(notes) });

  const cancelReason = textValue(f.cancel_reason?.[0]);
  if (cancelReason) and.push({ cancel_reason: contains(cancelReason) });

  // Importe (exacto)
  const amountText = textValue(f.amount?.[0]);
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
  from_account: { select: { id: true, name: true, kind: true, bank_name: true } },
  to_account: { select: { id: true, name: true, kind: true, bank_name: true } },
} as const;

function shape(rows: Prisma.treasury_transfersGetPayload<{ select: typeof TRANSFER_SELECT }>[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
    date: isoDay(r.date),
    amount: r.amount.toString(),
    notes: r.notes,
    created_at: r.created_at,
    cancelled: r.cancelled_at != null,
    cancel_reason: r.cancel_reason,
    from_account: {
      id: r.from_account.id,
      name: r.from_account.name,
      kind: r.from_account.kind,
      bankName: r.from_account.bank_name,
    },
    to_account: {
      id: r.to_account.id,
      name: r.to_account.name,
      kind: r.to_account.kind,
      bankName: r.to_account.bank_name,
    },
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
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: TransferOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = ownEntry(SORT_MAP, s.id);
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

export async function getAllTreasuryTransfersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<TreasuryTransferListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar las transferencias.' };

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: TransferOrderBy[] = [{ date: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) => prisma.treasury_transfers.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.treasury_transfers.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: TRANSFER_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('transferencias'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar transferencias de tesoreria', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de transferencias. Intente nuevamente.');
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
