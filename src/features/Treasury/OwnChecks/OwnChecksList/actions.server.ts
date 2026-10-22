'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
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
import { OWN_CHECK_KIND_VALUES, OWN_CHECK_STATUS_VALUES } from './constants';

const logger = new Logger('features/Treasury/OwnChecks/OwnChecksList');

type OwnCheckWhere = Prisma.own_checksWhereInput;
type OwnCheckOrderBy = Prisma.own_checksOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set(['number', 'kind', 'amount', 'issue_date', 'payment_date', 'debited_on']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => OwnCheckOrderBy[]> = {
  account: (dir) => [{ account: { name: dir } }],
  supplier: (dir) => [{ supplier: { name: dir } }],
  status: (dir) => [{ status: dir }],
  payment_order: (dir) => [{ payment_order_payment: { payment_order: { number: dir } } }],
};

/** Tope de filas por export. */
const EXPORT_LIMIT = 10_000;

const DATE_RANGE_COLUMNS = ['issue_date', 'payment_date', 'debited_on'];

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'cheques-propios', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** WHERE compartido entre paginated, export y facets. Los valores inválidos de filtro se ignoran. */
function buildWhereClause(companyId: string, state: FilterState): OwnCheckWhere {
  const f = state.filters;
  const and: OwnCheckWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { supplier: { name: contains(search) } },
        { account: { name: contains(search) } },
        { payment_order_payment: { payment_order: { number: contains(search) } } },
      ],
    });
  }

  const account = facetWhere('account_id', f.account, { kind: 'uuid' });
  if (account) and.push(account as OwnCheckWhere);
  const supplier = facetWhere('supplier_id', f.supplier, { kind: 'uuid', nullable: true });
  if (supplier) and.push(supplier as OwnCheckWhere);
  const status = facetWhere('status', f.status, { kind: 'enum', allowed: OWN_CHECK_STATUS_VALUES });
  if (status) and.push(status as OwnCheckWhere);
  const kind = facetWhere('kind', f.kind, { kind: 'enum', allowed: OWN_CHECK_KIND_VALUES });
  if (kind) and.push(kind as OwnCheckWhere);

  and.push(buildTreasuryDateRangeWhere(f, { dateColumns: DATE_RANGE_COLUMNS }) as OwnCheckWhere);

  const number = textValue(f.number?.[0]);
  if (number) and.push({ number: contains(number) });

  const orderNumber = textValue(f.payment_order?.[0]);
  if (orderNumber) and.push({ payment_order_payment: { payment_order: { number: contains(orderNumber) } } });

  // Importe (exacto)
  const amountText = textValue(f.amount?.[0]);
  if (amountText) {
    const normalized = parseAmountText(amountText);
    and.push(normalized ? { amount: new Prisma.Decimal(normalized) } : { id: { in: [] } });
  }

  return { AND: and };
}

const OWN_CHECK_SELECT = {
  id: true,
  number: true,
  kind: true,
  amount: true,
  issue_date: true,
  payment_date: true,
  debited_on: true,
  status: true,
  account: { select: { id: true, name: true } },
  checkbook: { select: { first_number: true, last_number: true } },
  supplier: { select: { id: true, name: true } },
  payment_order_payment: { select: { payment_order: { select: { id: true, number: true } } } },
} satisfies Prisma.own_checksSelect;

function shape(rows: Prisma.own_checksGetPayload<{ select: typeof OWN_CHECK_SELECT }>[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    kind: r.kind,
    amount: r.amount ? r.amount.toString() : null,
    issueDate: isoDay(r.issue_date),
    paymentDate: isoDay(r.payment_date),
    debitedOn: isoDay(r.debited_on),
    status: r.status,
    account: { id: r.account.id, name: r.account.name },
    checkbook: r.checkbook ? `${r.checkbook.first_number}–${r.checkbook.last_number}` : null,
    supplier: r.supplier ? { id: r.supplier.id, name: r.supplier.name } : null,
    paymentOrder: r.payment_order_payment?.payment_order
      ? { id: r.payment_order_payment.payment_order.id, number: r.payment_order_payment.payment_order.number }
      : null,
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getOwnChecksPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: OwnCheckOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = ownEntry(SORT_MAP, s.id);
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: OwnCheckOrderBy[] = [...resolvedSorts, { payment_date: 'asc' }, { number: 'asc' }, { id: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.own_checks.findMany({ where, orderBy, skip, take, select: OWN_CHECK_SELECT }),
      prisma.own_checks.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener cheques propios', { data: { error } });
    throw new Error('No se pudo obtener la lista de cheques propios');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllOwnChecksForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<OwnCheckListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar los cheques propios.' };

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: OwnCheckOrderBy[] = [{ payment_date: 'asc' }, { number: 'asc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) => prisma.own_checks.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.own_checks.findMany({ where: { id: { in: ids }, company_id: companyId }, select: OWN_CHECK_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} cheques propios con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar cheques propios', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de cheques propios. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getOwnCheckSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const base: FilterState = parseSearchParams(searchParams ?? {});

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): OwnCheckWhere {
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.own_checks.groupBy({ by: ['status'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.status as string, r._count])) };
    }

    if (columnId === 'kind') {
      const rows = await prisma.own_checks.groupBy({ by: ['kind'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.kind as string, r._count])) };
    }

    if (columnId === 'account') {
      const rows = await prisma.own_checks.groupBy({ by: ['account_id'], where, _count: true });
      const counts = new Map(rows.map((r) => [r.account_id, r._count]));
      const ids = [...counts.keys()];
      const resolved = ids.length
        ? await prisma.treasury_accounts.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions: resolved };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.own_checks.groupBy({ by: ['supplier_id'], where, _count: true });
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.supplier_id ?? NULL_FILTER_VALUE, r._count);
      const ids = rows.flatMap((r) => (r.supplier_id ? [r.supplier_id] : []));
      const resolved = ids.length
        ? await prisma.suppliers.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return { counts, resolvedOptions: resolved };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de cheques propios', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type OwnCheckListItem = Awaited<ReturnType<typeof getOwnChecksPaginated>>['data'][number];
