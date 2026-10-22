'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { customer_receipt_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { formatCuitText } from '@/shared/utils/cuit-text';
import { isoDay } from '../../lib/dates';
import {
  buildTreasuryDateRangeWhere,
  facetWhere,
  ownEntry,
  parseAmountText,
  parseBoundedInt,
  safePaging,
  textValue,
} from '../../lib/filter-values';

const logger = new Logger('features/Treasury/Collections/ReceiptsList');

type ReceiptWhere = Prisma.customer_receiptsWhereInput;
type ReceiptOrderBy = Prisma.customer_receiptsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y los derivados se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['number', 'date', 'withholdings_total', 'received_total']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => ReceiptOrderBy[]> = {
  customer: (dir) => [{ customer: { name: dir } }],
  status: (dir) => [{ status: dir }],
  sent: (dir) => [{ sent_at: { sort: dir, nulls: 'last' } }],
};

/** Tope de filas por export: más que esto se pide acotar con filtros. */
const EXPORT_LIMIT = 10_000;

const DATE_RANGE_COLUMNS = ['date'];

const RECEIPT_STATUSES = Object.values(customer_receipt_status);

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'cobranzas', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero o no entra en numeric(15,2). */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = parseAmountText(text);
  return normalized ? new Prisma.Decimal(normalized) : null;
}

/** Ids de los recibos con exactamente `wanted` comprobantes (lineas INVOICE) imputados. */
async function receiptIdsWithInvoiceCount(companyId: string, wanted: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id
    FROM customer_receipts r
    LEFT JOIN customer_receipt_lines l ON l.receipt_id = r.id AND l.kind = 'INVOICE'
    WHERE r.company_id = ${companyId}::uuid
    GROUP BY r.id
    HAVING count(l.id) = ${wanted}::int`;
  return rows.map((r) => r.id);
}

/** WHERE compartido entre paginated, export y facets. */
async function buildWhereClause(companyId: string, state: FilterState): Promise<ReceiptWhere> {
  const f = state.filters;
  const and: ReceiptWhere[] = [{ company_id: companyId }];

  const search = textValue(state.search);
  if (search) and.push({ OR: [{ number: contains(search) }, { customer: { name: contains(search) } }] });

  const customer = facetWhere('customer_id', f.customer, { kind: 'uuid' });
  if (customer) and.push(customer as ReceiptWhere);
  const status = facetWhere('status', f.status, { kind: 'enum', allowed: RECEIPT_STATUSES });
  if (status) and.push(status as ReceiptWhere);
  and.push(buildTreasuryDateRangeWhere(f, { dateColumns: DATE_RANGE_COLUMNS }) as ReceiptWhere);

  // Enviado (derivado de sent_at): ambos valores = sin filtro
  const sent = f.sent ?? [];
  const wantsSent = sent.includes('YES');
  const wantsNotSent = sent.includes('NO');
  if (wantsSent && !wantsNotSent) and.push({ sent_at: { not: null } });
  if (wantsNotSent && !wantsSent) and.push({ sent_at: null });

  // Texto
  const number = textValue(f.number?.[0]);
  if (number) and.push({ number: contains(number) });

  // Importes (exactos)
  for (const field of ['withholdings_total', 'received_total'] as const) {
    const text = textValue(f[field]?.[0]);
    if (!text) continue;
    const amount = parseAmount(text);
    and.push(amount ? { [field]: amount } : { id: { in: [] } });
  }

  // Cantidad de comprobantes (exacta)
  const countText = textValue(f.invoices_count?.[0]);
  if (countText) {
    const count = parseBoundedInt(countText);
    and.push({ id: { in: count != null ? await receiptIdsWithInvoiceCount(companyId, count) : [] } });
  }

  return { AND: and };
}

const RECEIPT_SELECT = {
  id: true,
  number: true,
  date: true,
  status: true,
  withholdings_total: true,
  received_total: true,
  sent_at: true,
  cancel_reason: true,
  customer: { select: { id: true, name: true, cuit: true } },
  _count: { select: { lines: { where: { kind: 'INVOICE' } } } },
} satisfies Prisma.customer_receiptsSelect;

function shape(rows: Prisma.customer_receiptsGetPayload<{ select: typeof RECEIPT_SELECT }>[]) {
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
    date: isoDay(r.date),
    status: r.status,
    customer: { id: r.customer.id, name: r.customer.name, cuit: formatCuitText(r.customer.cuit.toString()) },
    invoicesCount: r._count.lines,
    withholdingsTotal: r.withholdings_total.toString(),
    receivedTotal: r.received_total.toString(),
    sent: r.sent_at != null,
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getReceiptsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = safePaging(state);
    const where = await buildWhereClause(companyId, state);

    const resolvedSorts: ReceiptOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = ownEntry(SORT_MAP, s.id);
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    // Los borradores (sin numero) quedan primero dentro de la misma fecha
    const orderBy: ReceiptOrderBy[] = [
      ...resolvedSorts,
      { date: 'desc' },
      { number: { sort: 'desc', nulls: 'first' } },
      { created_at: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.customer_receipts.findMany({ where, orderBy, skip, take, select: RECEIPT_SELECT }),
      prisma.customer_receipts.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener recibos de cobranza', { data: { error } });
    throw new Error('No se pudo obtener la lista de recibos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllReceiptsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<ReceiptListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, message: 'No tiene permiso para exportar los recibos.' };

  try {
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);
    const orderBy: ReceiptOrderBy[] = [
      { date: 'desc' },
      { number: { sort: 'desc', nulls: 'first' } },
      { created_at: 'desc' },
      { id: 'asc' },
    ];
    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_LIMIT,
      listIds: (take) => prisma.customer_receipts.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.customer_receipts.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: RECEIPT_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('recibos'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar recibos de cobranza', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de recibos. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getReceiptSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): Promise<ReceiptWhere> {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    const where = await crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.customer_receipts.groupBy({ by: ['status'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.status as string, r._count])) };
    }

    if (columnId === 'sent') {
      const [sent, notSent] = await Promise.all([
        prisma.customer_receipts.count({ where: { AND: [where, { sent_at: { not: null } }] } }),
        prisma.customer_receipts.count({ where: { AND: [where, { sent_at: null }] } }),
      ]);
      return {
        counts: new Map([
          ['YES', sent],
          ['NO', notSent],
        ]),
      };
    }

    if (columnId === 'customer') {
      const rows = await prisma.customer_receipts.groupBy({ by: ['customer_id'], where, _count: true });
      const ids = rows.map((r) => r.customer_id);
      const customers = ids.length
        ? await prisma.customers.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: new Map(rows.map((r) => [r.customer_id, r._count])),
        resolvedOptions: customers,
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de recibos de cobranza', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type ReceiptListItem = Awaited<ReturnType<typeof getReceiptsPaginated>>['data'][number];
