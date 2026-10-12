'use server';

import { amountOf } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { cbteLabel, formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { customerCheckDebtSql } from '../../lib/rejected-checks';
import { invoiceBalanceSql } from '../../lib/receivables';
import { COLLECTABLE_CBTE_TYPES, overdueDays, receivableState, type ReceivableState } from '../../lib/receipt-rules';
import { localToday } from '../../actions/shared';
import { isUuid, ownEntry, parseAmountText, parseBoundedInt, parseDay, safePaging, textValue } from '../../lib/filter-values';
import { RECEIVABLE_CURRENCIES } from './constants';

const logger = new Logger('features/Treasury/Collections/ReceivablesList');

type FilterState = ReturnType<typeof parseSearchParams>;

const STATES: readonly ReceivableState[] = ['OVERDUE', 'DUE', 'IN_DRAFT'];

// ============================================================================
// SQL (todo parametrizado con Prisma.sql; los fragmentos Prisma.raw son constantes del archivo)
// ============================================================================

/** Orden: columnId -> expresiones SQL fijas sobre la subconsulta `r`. Nunca se arma con texto del usuario. */
const SORT_SQL: Record<string, (dir: Prisma.Sql, today: string) => Prisma.Sql[]> = {
  customer: (dir) => [Prisma.sql`r.customer_name ${dir}`],
  voucher: (dir) => [Prisma.sql`r.cbte_type ${dir}`, Prisma.sql`r.sales_point ${dir}`, Prisma.sql`r.number ${dir}`],
  issue_date: (dir) => [Prisma.sql`r.issue_date ${dir}`],
  due_date: (dir) => [Prisma.sql`r.due_date ${dir} NULLS LAST`],
  currency: (dir) => [Prisma.sql`r.currency ${dir}`],
  total: (dir) => [Prisma.sql`r.total ${dir}`],
  pending: (dir) => [Prisma.sql`r.pending ${dir}`],
  overdue_days: (dir, today) => [Prisma.sql`GREATEST(0, ${today}::date - COALESCE(r.due_date, ${today}::date)) ${dir}`],
  state: (dir, today) => [Prisma.sql`${stateSql(today)} ${dir}`],
};

const DEFAULT_ORDER = Prisma.sql`r.due_date ASC NULLS LAST, r.issue_date ASC, r.number ASC`;

/** Estado derivado: misma regla que `receivableState` (libre = pendiente, reservado = reservado). */
function stateSql(today: string): Prisma.Sql {
  return Prisma.sql`(CASE
    WHEN r.pending <= 0 AND r.reserved > 0 THEN 'IN_DRAFT'
    WHEN r.row_kind = 'CHECK' THEN 'OVERDUE'
    WHEN r.due_date IS NOT NULL AND r.due_date < ${today}::date THEN 'OVERDUE'
    ELSE 'DUE' END)`;
}

/** "Factura A 00003-00000124": el mismo texto de la pantalla, para filtrar por lo que el usuario ve. */
function voucherLabelSql(): Prisma.Sql {
  const branches = COLLECTABLE_CBTE_TYPES.map((t) => Prisma.sql`WHEN ${t}::int THEN ${cbteLabel(t)}::text`);
  return Prisma.sql`COALESCE(r.check_label, CASE r.cbte_type ${Prisma.join(branches, ' ')} ELSE '' END
    || ' ' || lpad(r.sales_point::text, 5, '0') || '-' || lpad(r.number::text, 8, '0'))`;
}

/** Label de la deuda de un cheque (misma frase que `rejectedCheckLabel`), armado en SQL sobre el alias `d`. */
function rejectedCheckLabelSql(): Prisma.Sql {
  return Prisma.sql`('Cheque rechazado Nº ' || d.number || ' — ' || d.bank)`;
}

const like = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Subconsulta `r`: saldo de cada comprobante cobrable de la empresa (fórmula única de
 * `invoiceBalanceSql`) UNIDO a las deudas por cheques rechazados de los clientes (fórmula única de
 * `customerCheckDebtSql`), + nombre del cliente. Solo con algo por cobrar. La deuda de un cheque
 * se muestra en ARS, con la fecha del rechazo como emisión y vencimiento.
 */
function baseSql(companyId: string): Prisma.Sql {
  const collectable = [...COLLECTABLE_CBTE_TYPES];
  const invoiceWhere = Prisma.sql`i.company_id = ${companyId}::uuid AND i.status = 'autorizada' AND i.cbte_type = ANY(${collectable}::int[])`;
  const checkWhere = Prisma.sql`c.company_id = ${companyId}::uuid`;
  return Prisma.sql`
    SELECT u.*, c.name AS customer_name
    FROM (
      SELECT b.id, b.customer_id, b.cbte_type, b.currency::text AS currency, b.sales_point, b.number,
             b.issue_date::date AS issue_date, b.due_date::date AS due_date, b.total::numeric AS total,
             b.pending::numeric AS pending, b.reserved::numeric AS reserved,
             'INVOICE'::text AS row_kind, NULL::text AS check_label
      FROM (${invoiceBalanceSql(invoiceWhere, null)}) b
      WHERE b.pending > 0 OR (b.pending = 0 AND b.reserved > 0)
      UNION ALL
      SELECT d.id, d.customer_id, NULL::int, 'ARS'::text, NULL::int, NULL::int,
             d.rejected_on::date, d.rejected_on::date, d.amount::numeric,
             d.pending::numeric, d.reserved::numeric,
             'CHECK'::text, ${rejectedCheckLabelSql()}
      FROM (${customerCheckDebtSql(checkWhere, null)}) d
      WHERE d.pending::numeric > 0 OR (d.pending::numeric = 0 AND d.reserved::numeric > 0)
    ) u
    JOIN customers c ON c.id = u.customer_id
  `;
}

/** Condiciones sobre `r` a partir del estado de la tabla; `exclude` omite el filtro propio (cross-filter de facets). */
function buildConditions(state: FilterState, today: string, exclude?: string): Prisma.Sql[] {
  const f = state.filters;
  const conditions: Prisma.Sql[] = [];

  const search = textValue(state.search);
  if (search) {
    const pattern = like(search);
    conditions.push(Prisma.sql`(r.customer_name ILIKE ${pattern} OR ${voucherLabelSql()} ILIKE ${pattern})`);
  }

  if (exclude !== 'customer') {
    const ids = (f.customer ?? []).filter(isUuid);
    if (ids.length) conditions.push(Prisma.sql`r.customer_id = ANY(${ids}::uuid[])`);
  }

  if (exclude !== 'currency') {
    const currencies = (f.currency ?? []).filter((v) => (RECEIVABLE_CURRENCIES as readonly string[]).includes(v));
    if (currencies.length) conditions.push(Prisma.sql`trim(r.currency) = ANY(${currencies}::text[])`);
  }

  if (exclude !== 'state') {
    const states = (f.state ?? []).filter((v) => (STATES as readonly string[]).includes(v));
    if (states.length) conditions.push(Prisma.sql`${stateSql(today)} = ANY(${states}::text[])`);
  }

  const dateRange = (columnId: 'issue_date' | 'due_date', column: Prisma.Sql) => {
    if (exclude === columnId) return;
    const from = parseDay(f[`${columnId}_from`]?.[0]);
    const to = parseDay(f[`${columnId}_to`]?.[0]);
    if (from) conditions.push(Prisma.sql`${column} >= ${from}::date`);
    if (to) conditions.push(Prisma.sql`${column} <= ${to}::date`);
  };
  dateRange('issue_date', Prisma.sql`r.issue_date`);
  dateRange('due_date', Prisma.sql`r.due_date`);

  const voucher = textValue(f.voucher?.[0]);
  if (voucher) conditions.push(Prisma.sql`${voucherLabelSql()} ILIKE ${like(voucher)}`);

  const exactAmount = (columnId: 'total' | 'pending', column: Prisma.Sql) => {
    const text = textValue(f[columnId]?.[0]);
    if (!text) return;
    const amount = parseAmountText(text);
    conditions.push(amount ? Prisma.sql`${column} = ${amount}::numeric` : Prisma.sql`false`);
  };
  exactAmount('total', Prisma.sql`r.total`);
  exactAmount('pending', Prisma.sql`r.pending`);

  const daysText = textValue(f.overdue_days?.[0]);
  if (daysText) {
    const days = parseBoundedInt(daysText);
    conditions.push(
      days != null
        ? Prisma.sql`GREATEST(0, ${today}::date - COALESCE(r.due_date, ${today}::date)) = ${days}::int`
        : Prisma.sql`false`
    );
  }

  return conditions;
}

const whereSql = (conditions: Prisma.Sql[]) =>
  conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

// ============================================================================
// FILAS
// ============================================================================

type ReceivableRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  cbte_type: number;
  sales_point: number;
  number: number;
  currency: string;
  issue_date: string;
  due_date: string | null;
  total: string;
  pending: string;
  reserved: string;
  row_kind: 'INVOICE' | 'CHECK';
  check_label: string | null;
};

const SELECT_COLUMNS = Prisma.sql`
  r.id, r.customer_id, r.customer_name, r.cbte_type, r.sales_point, r.number, trim(r.currency) AS currency,
  r.issue_date::text AS issue_date, r.due_date::text AS due_date,
  r.total::numeric(15,2)::text AS total, r.pending::numeric(15,2)::text AS pending, r.reserved::numeric(15,2)::text AS reserved,
  r.row_kind, r.check_label`;

function shape(rows: ReceivableRow[], today: string) {
  return rows.map((r) => ({
    id: r.id,
    customer: { id: r.customer_id, name: r.customer_name },
    cbteType: r.cbte_type,
    kind: r.row_kind,
    voucherLabel: r.check_label ?? formatVoucherLabel(r.cbte_type, r.sales_point, r.number),
    issueDate: r.issue_date,
    dueDate: r.due_date,
    currency: r.currency,
    total: r.total,
    pending: r.pending,
    overdueDays: overdueDays(r.due_date, today),
    state:
      r.row_kind === 'CHECK'
        ? // La deuda de un cheque rechazado nace vencida (aunque el rechazo sea de hoy)
          (amountOf(r.pending) > BigInt(0) ? 'OVERDUE' : 'IN_DRAFT')
        : receivableState({ free: amountOf(r.pending), reserved: amountOf(r.reserved), dueDate: r.due_date, today }),
  }));
}

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'cobranzas', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

function orderSql(state: FilterState, today: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  for (const s of state.sorting) {
    const mapper = ownEntry(SORT_SQL, s.id);
    if (mapper) parts.push(...mapper(s.desc ? Prisma.sql`DESC` : Prisma.sql`ASC`, today));
  }
  parts.push(DEFAULT_ORDER);
  return Prisma.sql`ORDER BY ${Prisma.join(parts, ', ')}`;
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getReceivablesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const today = localToday();
    const where = whereSql(buildConditions(state, today));
    const { skip, take } = safePaging(state);

    const [rows, counted] = await Promise.all([
      prisma.$queryRaw<ReceivableRow[]>`
        SELECT ${SELECT_COLUMNS} FROM (${baseSql(companyId)}) r ${where} ${orderSql(state, today)}
        LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM (${baseSql(companyId)}) r ${where}`,
    ]);
    return { data: shape(rows, today), total: Number(counted[0]?.total ?? 0) };
  } catch (error) {
    logger.error('Error al obtener comprobantes a cobrar', { data: { error } });
    throw new Error('No se pudo obtener la lista de comprobantes a cobrar');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllReceivablesForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const today = localToday();
    const rows = await prisma.$queryRaw<ReceivableRow[]>`
      SELECT ${SELECT_COLUMNS} FROM (${baseSql(companyId)}) r ${whereSql(buildConditions(state, today))} ${orderSql(state, today)}`;
    return shape(rows, today);
  } catch (error) {
    logger.error('Error al exportar comprobantes a cobrar', { data: { error } });
    throw new Error('No se pudo exportar la lista de comprobantes a cobrar');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getReceivableSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  try {
    const state = parseSearchParams(searchParams ?? {});
    const today = localToday();
    // Todos los filtros activos MENOS el de la columna que se esta abriendo
    const where = whereSql(buildConditions(state, today, columnId));

    if (columnId === 'customer') {
      const rows = await prisma.$queryRaw<{ id: string; name: string; count: bigint }[]>`
        SELECT r.customer_id AS id, r.customer_name AS name, count(*) AS count
        FROM (${baseSql(companyId)}) r ${where} GROUP BY r.customer_id, r.customer_name ORDER BY r.customer_name`;
      return {
        counts: new Map(rows.map((r) => [r.id, Number(r.count)])),
        resolvedOptions: rows.map((r) => ({ id: r.id, name: r.name })),
      };
    }

    if (columnId === 'currency') {
      const rows = await prisma.$queryRaw<{ key: string; count: bigint }[]>`
        SELECT trim(r.currency) AS key, count(*) AS count FROM (${baseSql(companyId)}) r ${where} GROUP BY trim(r.currency)`;
      return { counts: new Map(rows.map((r) => [r.key, Number(r.count)])) };
    }

    if (columnId === 'state') {
      const rows = await prisma.$queryRaw<{ key: string; count: bigint }[]>`
        SELECT ${stateSql(today)} AS key, count(*) AS count FROM (${baseSql(companyId)}) r ${where} GROUP BY 1`;
      return { counts: new Map(rows.map((r) => [r.key, Number(r.count)])) };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de comprobantes a cobrar', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type ReceivableListItem = Awaited<ReturnType<typeof getReceivablesPaginated>>['data'][number];
