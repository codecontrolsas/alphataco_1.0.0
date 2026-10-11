'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { formatCuit } from '@/features/Purchases/lib/supplier-ids';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { CUSTOMER_FILES_BUCKET } from '../../lib/storage-files';
import { CUSTOMER_WITHHOLDING_TAX_LABELS } from '../../schemas/receipts';

const logger = new Logger('features/Treasury/Withholdings/WithholdingsList');

type WithholdingWhere = Prisma.customer_receipt_withholdingsWhereInput;
type WithholdingOrderBy = Prisma.customer_receipt_withholdingsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;
type WithholdingTax = keyof typeof CUSTOMER_WITHHOLDING_TAX_LABELS;

// ============================================================================
// CONSTANTS
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAX_VALUES = Object.keys(CUSTOMER_WITHHOLDING_TAX_LABELS) as WithholdingTax[];

/** Ordenables (campos directos). Las FK y los derivados se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['certificate_date', 'tax', 'jurisdiction', 'certificate_number', 'amount']);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => WithholdingOrderBy[]> = {
  customer: (dir) => [{ receipt: { customer: { name: dir } } }],
  cuit: (dir) => [{ receipt: { customer: { cuit: dir } } }],
  receipt: (dir) => [{ receipt: { number: dir } }],
  certificate: (dir) => [{ file_path: { sort: dir, nulls: 'last' } }],
};

const DATE_RANGE_COLUMNS = ['certificate_date'];

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('tesoreria', 'retenciones-sufridas', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Importe tipeado ("1234,56" o "1234.56") -> Decimal exacto; `null` si no es un numero. */
function parseAmount(text: string): Prisma.Decimal | null {
  const normalized = text
    .trim()
    .replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m))
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

/** Ids de los clientes de la empresa cuyo CUIT contiene los digitos tipeados (el CUIT es numerico en la base). */
async function customerIdsByCuit(companyId: string, typed: string): Promise<string[]> {
  const digits = typed.replace(/\D/g, '');
  if (!digits) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM customers WHERE company_id = ${companyId}::uuid AND cuit::text LIKE ${`%${digits}%`}`;
  return rows.map((r) => r.id);
}

/** WHERE compartido entre paginated, export, totales y facets. */
async function buildWhereClause(companyId: string, state: FilterState): Promise<WithholdingWhere> {
  const f = state.filters;
  const and: WithholdingWhere[] = [{ company_id: companyId, receipt: { status: 'CONFIRMED' } }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { certificate_number: contains(search) },
        { jurisdiction: contains(search) },
        { receipt: { number: contains(search) } },
        { receipt: { customer: { name: contains(search) } } },
      ],
    });
  }

  const taxes = (f.tax ?? []).filter((v): v is WithholdingTax => (TAX_VALUES as string[]).includes(v));
  if (taxes.length) and.push({ tax: { in: taxes } });

  const customers = (f.customer ?? []).filter((v) => UUID_RE.test(v));
  if (customers.length) and.push({ customer_id: { in: customers } });

  const certificate = f.certificate ?? [];
  const wantsWith = certificate.includes('WITH');
  const wantsWithout = certificate.includes('WITHOUT');
  if (wantsWith && !wantsWithout) and.push({ file_path: { not: null } });
  if (wantsWithout && !wantsWith) and.push({ file_path: null });

  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as WithholdingWhere);

  // Texto
  const jurisdiction = f.jurisdiction?.[0]?.trim();
  if (jurisdiction) and.push({ jurisdiction: contains(jurisdiction) });

  const certificateNumber = f.certificate_number?.[0]?.trim();
  if (certificateNumber) and.push({ certificate_number: contains(certificateNumber) });

  const receiptNumber = f.receipt?.[0]?.trim();
  if (receiptNumber) and.push({ receipt: { number: contains(receiptNumber) } });

  const cuit = f.cuit?.[0]?.trim();
  if (cuit) and.push({ customer_id: { in: await customerIdsByCuit(companyId, cuit) } });

  const amountText = f.amount?.[0]?.trim();
  if (amountText) {
    const amount = parseAmount(amountText);
    and.push(amount ? { amount } : { id: { in: [] } });
  }

  return { AND: and };
}

const WITHHOLDING_SELECT = {
  id: true,
  tax: true,
  jurisdiction: true,
  certificate_number: true,
  certificate_date: true,
  amount: true,
  file_path: true,
  file_name: true,
  receipt: {
    select: {
      id: true,
      number: true,
      customer: { select: { id: true, name: true, cuit: true } },
    },
  },
} satisfies Prisma.customer_receipt_withholdingsSelect;

async function shape(rows: Prisma.customer_receipt_withholdingsGetPayload<{ select: typeof WITHHOLDING_SELECT }>[]) {
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      tax: r.tax,
      jurisdiction: r.jurisdiction,
      certificateNumber: r.certificate_number,
      // Fecha valor (@db.Date): se toma el dia tal cual, sin correr zona horaria
      certificateDate: r.certificate_date.toISOString().slice(0, 10),
      amount: r.amount.toString(),
      certificateUrl: r.file_path ? await storagePublicUrl(CUSTOMER_FILES_BUCKET, r.file_path) : null,
      certificateName: r.file_name,
      customer: { id: r.receipt.customer.id, name: r.receipt.customer.name },
      cuit: formatCuit(r.receipt.customer.cuit),
      receipt: { id: r.receipt.id, number: r.receipt.number },
    }))
  );
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getWithholdingsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state);

    const resolvedSorts: WithholdingOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const mapper = SORT_MAP[s.id];
      if (mapper) resolvedSorts.push(...mapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: WithholdingOrderBy[] = [...resolvedSorts, { certificate_date: 'desc' }, { certificate_number: 'asc' }];

    const [rows, total] = await Promise.all([
      prisma.customer_receipt_withholdings.findMany({ where, orderBy, skip, take, select: WITHHOLDING_SELECT }),
      prisma.customer_receipt_withholdings.count({ where }),
    ]);
    return { data: await shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener retenciones sufridas', { data: { error } });
    throw new Error('No se pudo obtener la lista de retenciones');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllWithholdingsForExport(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);
    const rows = await prisma.customer_receipt_withholdings.findMany({
      where,
      orderBy: [{ certificate_date: 'desc' }, { certificate_number: 'asc' }],
      select: WITHHOLDING_SELECT,
    });
    return await shape(rows);
  } catch (error) {
    logger.error('Error al exportar retenciones sufridas', { data: { error } });
    throw new Error('No se pudo exportar la lista de retenciones');
  }
}

// ============================================================================
// TOTALES POR IMPUESTO (mismo WHERE que la tabla)
// ============================================================================

export async function getWithholdingTotalsByTax(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);
    const rows = await prisma.customer_receipt_withholdings.groupBy({
      by: ['tax'],
      where,
      _sum: { amount: true },
      _count: true,
    });
    return TAX_VALUES.flatMap((tax) => {
      const row = rows.find((r) => r.tax === tax);
      return row ? [{ tax, total: (row._sum.amount ?? new Prisma.Decimal(0)).toString(), count: row._count }] : [];
    });
  } catch (error) {
    logger.error('Error al totalizar retenciones sufridas', { data: { error } });
    throw new Error('No se pudieron calcular los totales de retenciones');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getWithholdingSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): Promise<WithholdingWhere> {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  try {
    const where = await crossWhere(columnId);

    if (columnId === 'tax') {
      const rows = await prisma.customer_receipt_withholdings.groupBy({ by: ['tax'], where, _count: true });
      return { counts: new Map(rows.map((r) => [r.tax as string, r._count])) };
    }

    if (columnId === 'certificate') {
      const [withFile, withoutFile] = await Promise.all([
        prisma.customer_receipt_withholdings.count({ where: { AND: [where, { file_path: { not: null } }] } }),
        prisma.customer_receipt_withholdings.count({ where: { AND: [where, { file_path: null }] } }),
      ]);
      return {
        counts: new Map([
          ['WITH', withFile],
          ['WITHOUT', withoutFile],
        ]),
      };
    }

    if (columnId === 'customer') {
      const rows = await prisma.customer_receipt_withholdings.groupBy({ by: ['customer_id'], where, _count: true });
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
    logger.error('Error al obtener facet de retenciones sufridas', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type WithholdingListItem = Awaited<ReturnType<typeof getWithholdingsPaginated>>['data'][number];
export type WithholdingTotals = Awaited<ReturnType<typeof getWithholdingTotalsByTax>>;
