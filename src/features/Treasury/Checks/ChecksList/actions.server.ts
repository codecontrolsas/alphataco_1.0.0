'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { depositWarning, DEPOSIT_WINDOW_DAYS, depositDeadline, type DepositWarning } from '../../lib/checks-dates';
import {
  buildTreasuryDateRangeWhere,
  facetWhere,
  isUuid,
  ownEntry,
  parseAmountText,
  parseDay,
  safePaging,
  textValue,
} from '../../lib/filter-values';
import { isoDay } from '../../lib/dates';
import { treasuryToday } from '../../lib/today';
import { CHECK_KIND_VALUES, CHECK_STATUS_VALUES } from './constants';

const logger = new Logger('features/Treasury/Checks/ChecksList');

type CheckWhere = Prisma.third_party_checksWhereInput;
type CheckOrderBy = Prisma.third_party_checksOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set(['number', 'bank', 'kind', 'drawer_name', 'drawer_cuit', 'amount', 'issue_date', 'payment_date']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => CheckOrderBy[]> = {
  customer: (dir) => [{ customer: { name: dir } }],
  portfolio: (dir) => [{ portfolio: { name: dir } }],
  status: (dir) => [{ status: dir }],
  // Vence = fecha de pago + 30 dias: el mismo orden que la fecha de pago
  deposit_deadline: (dir) => [{ payment_date: dir }],
  destination: (dir) => [{ bank_account: { name: dir } }, { supplier: { name: dir } }],
};

/** Tope de filas por export. */
const EXPORT_LIMIT = 10_000;

const DATE_RANGE_COLUMNS = ['issue_date', 'payment_date'];
const TEXT_COLUMNS = ['number', 'bank', 'drawer_name', 'drawer_cuit'] as const;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'cheques', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Corre un dia de la fecha de pago al dia de vencimiento (o a la inversa con delta negativo). */
const shiftDay = (value: string, days: number) => moment.utc(value, 'YYYY-MM-DD', true).add(days, 'days').toDate();

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): CheckWhere {
  const f = state.filters;
  const and: CheckWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { bank: contains(search) },
        { drawer_name: contains(search) },
        { drawer_cuit: contains(search) },
        { customer: { name: contains(search) } },
      ],
    });
  }

  const customer = facetWhere('customer_id', f.customer, { kind: 'uuid' });
  if (customer) and.push(customer as CheckWhere);
  const portfolio = facetWhere('portfolio_id', f.portfolio, { kind: 'uuid' });
  if (portfolio) and.push(portfolio as CheckWhere);
  const status = facetWhere('status', f.status, { kind: 'enum', allowed: CHECK_STATUS_VALUES });
  if (status) and.push(status as CheckWhere);
  const kind = facetWhere('kind', f.kind, { kind: 'enum', allowed: CHECK_KIND_VALUES });
  if (kind) and.push(kind as CheckWhere);

  // Destino: cuenta bancaria o proveedor; "Sin destino" = ninguno de los dos
  const destinationValues = f.destination ?? [];
  const destinationIds = destinationValues.filter(isUuid);
  const wantsNone = destinationValues.includes(NULL_FILTER_VALUE);
  if (destinationIds.length || wantsNone) {
    const or: CheckWhere[] = [];
    if (destinationIds.length) {
      or.push({ bank_account_id: { in: destinationIds } }, { supplier_id: { in: destinationIds } });
    }
    if (wantsNone) or.push({ bank_account_id: null, supplier_id: null });
    and.push({ OR: or });
  }

  and.push(buildTreasuryDateRangeWhere(f, { dateColumns: DATE_RANGE_COLUMNS }) as CheckWhere);

  // Vence para depositar = fecha de pago + 30 dias: el rango se corre 30 dias hacia atras sobre payment_date
  const dueFrom = parseDay(f.deposit_deadline_from?.[0]);
  const dueTo = parseDay(f.deposit_deadline_to?.[0]);
  if (dueFrom || dueTo) {
    const range: { gte?: Date; lte?: Date } = {};
    if (dueFrom) range.gte = shiftDay(dueFrom, -DEPOSIT_WINDOW_DAYS);
    if (dueTo) range.lte = shiftDay(dueTo, -DEPOSIT_WINDOW_DAYS);
    and.push({ payment_date: range });
  }

  for (const column of TEXT_COLUMNS) {
    const text = textValue(f[column]?.[0]);
    if (text) and.push({ [column]: contains(text) });
  }

  // Importe (exacto)
  const amountText = textValue(f.amount?.[0]);
  if (amountText) {
    const normalized = parseAmountText(amountText);
    and.push(normalized ? { amount: new Prisma.Decimal(normalized) } : { id: { in: [] } });
  }

  return { AND: and };
}

const CHECK_SELECT = {
  id: true,
  number: true,
  bank: true,
  kind: true,
  drawer_name: true,
  drawer_cuit: true,
  amount: true,
  issue_date: true,
  payment_date: true,
  status: true,
  customer: { select: { id: true, name: true } },
  portfolio: { select: { id: true, name: true } },
  bank_account: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.third_party_checksSelect;

function shape(rows: Prisma.third_party_checksGetPayload<{ select: typeof CHECK_SELECT }>[]) {
  const today = treasuryToday();
  return rows.map((r) => {
    // Fechas @db.Date: el dia tal cual, sin correr zona horaria
    const paymentDate = isoDay(r.payment_date);
    const warning: DepositWarning = r.status === 'IN_PORTFOLIO' ? depositWarning(paymentDate, today) : 'OK';
    return {
      id: r.id,
      number: r.number,
      bank: r.bank,
      kind: r.kind,
      drawerName: r.drawer_name,
      drawerCuit: r.drawer_cuit,
      amount: r.amount.toString(),
      issueDate: isoDay(r.issue_date),
      paymentDate,
      depositDeadline: depositDeadline(paymentDate),
      depositWarning: warning,
      status: r.status,
      customer: { id: r.customer.id, name: r.customer.name },
      portfolio: { id: r.portfolio.id, name: r.portfolio.name },
      destination: r.bank_account?.name ?? r.supplier?.name ?? '',
      destinationId: r.bank_account?.id ?? r.supplier?.id ?? null,
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getChecksPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: CheckOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = ownEntry(SORT_MAP, s.id);
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: CheckOrderBy[] = [...resolvedSorts, { payment_date: 'asc' }, { number: 'asc' }, { id: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.third_party_checks.findMany({ where, orderBy, skip, take, select: CHECK_SELECT }),
      prisma.third_party_checks.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener cheques', { data: { error } });
    throw new Error('No se pudo obtener la lista de cheques');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllChecksForExport(searchParams: DataTableSearchParams): Promise<ExportResult<CheckListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar los cheques.' };

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: CheckOrderBy[] = [{ payment_date: 'asc' }, { number: 'asc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) => prisma.third_party_checks.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) => prisma.third_party_checks.findMany({ where: { id: { in: ids }, company_id: companyId }, select: CHECK_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} cheques con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar cheques', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en producción.
    return {
      ok: false,
      message: error instanceof ExportTooLargeError ? error.message : 'No se pudo exportar la lista de cheques. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getCheckSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const base: FilterState = parseSearchParams(searchParams ?? {});

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): CheckWhere {
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.third_party_checks.groupBy({ by: ['status'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.status as string, r._count])) };
    }

    if (columnId === 'kind') {
      const rows = await prisma.third_party_checks.groupBy({ by: ['kind'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.kind as string, r._count])) };
    }

    if (columnId === 'customer' || columnId === 'portfolio') {
      const field = columnId === 'customer' ? 'customer_id' : 'portfolio_id';
      const rows = await prisma.third_party_checks.groupBy({ by: [field], where, _count: true });
      const counts = new Map(rows.map((r) => [r[field] as string, r._count]));
      const ids = [...counts.keys()];
      const resolved = ids.length
        ? columnId === 'customer'
          ? await prisma.customers.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
          : await prisma.treasury_accounts.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
        : [];
      return { counts, resolvedOptions: resolved };
    }

    if (columnId === 'destination') {
      const [banks, suppliers, none] = await Promise.all([
        prisma.third_party_checks.groupBy({ by: ['bank_account_id'], where: { AND: [where, { bank_account_id: { not: null } }] }, _count: true }),
        prisma.third_party_checks.groupBy({ by: ['supplier_id'], where: { AND: [where, { supplier_id: { not: null } }] }, _count: true }),
        prisma.third_party_checks.count({ where: { AND: [where, { bank_account_id: null, supplier_id: null }] } }),
      ]);
      const counts = new Map<string, number>();
      for (const r of banks) if (r.bank_account_id) counts.set(r.bank_account_id, r._count);
      for (const r of suppliers) if (r.supplier_id) counts.set(r.supplier_id, r._count);
      if (none > 0) counts.set(NULL_FILTER_VALUE, none);
      const bankIds = banks.flatMap((r) => (r.bank_account_id ? [r.bank_account_id] : []));
      const supplierIds = suppliers.flatMap((r) => (r.supplier_id ? [r.supplier_id] : []));
      const [accountRows, supplierRows] = await Promise.all([
        bankIds.length ? prisma.treasury_accounts.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }) : [],
        supplierIds.length ? prisma.suppliers.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } }) : [],
      ]);
      const resolvedOptions = [...accountRows, ...supplierRows].sort((a, b) => a.name.localeCompare(b.name));
      return { counts, resolvedOptions };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de cheques', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type CheckListItem = Awaited<ReturnType<typeof getChecksPaginated>>['data'][number];
