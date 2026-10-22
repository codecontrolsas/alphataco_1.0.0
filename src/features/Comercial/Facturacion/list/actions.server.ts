'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { toDateOnly } from '@/shared/lib/date-only';
import { exportFailure, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { runFacet, withoutOwnFilter, type FacetConfig } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cbteLabel, formatVoucherNumber } from '../lib/invoice-type';
import {
  INVOICE_ATTENTION_KEYS,
  invoiceAttentionWhere,
  isInvoiceAttentionKey,
  type InvoiceAttentionKey,
} from './invoice-attention';

const logger = new Logger('Comercial/Facturacion/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Columnas ordenables server-side (directas o mapeadas vía FK_SORT_MAP). */
const VALID_SORT_FIELDS = new Set([
  'issue_date',
  'cbte_type',
  'voucher_number',
  'sales_point',
  'customer',
  'cuit',
  'status',
  'environment',
  'simulated',
  'currency',
  'total',
  'cae',
  'cae_due_date',
  'created_at',
]);

/** Columnas cuyo orderBy no es `{ [columnId]: dir }`. */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  voucher_number: (dir) => ({ number: dir }),
  sales_point: (dir) => ({ sales_point: { number: dir } }),
  customer: (dir) => ({ customer: { name: dir } }),
  cuit: (dir) => ({ customer: { cuit: dir } }),
};

/** columnId → campo de Prisma para los filtros faceteados de valor string. */
const FACETED_COLUMN_MAP: Record<string, string> = {
  sales_point: 'sales_point_id',
  customer: 'customer_id',
  status: 'status',
  environment: 'environment',
  currency: 'currency',
};

/** Filtros que se resuelven a mano (no pasan por buildFiltersWhere). */
const MANUAL_FILTER_COLUMNS = ['cbte_type', 'simulated', 'voucher_number', 'cuit', 'total'];
const TEXT_COLUMNS = ['cae'];
const DATE_COLUMNS = ['issue_date', 'cae_due_date', 'created_at'];
/** Filtro virtual de las tarjetas del tablero (ver `invoice-attention.ts`). */
const ATTENTION_COLUMN = 'attention';

/** Única lista de claves de URL que filtran: el resto se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(FACETED_COLUMN_MAP),
  ...MANUAL_FILTER_COLUMNS,
  ...TEXT_COLUMNS,
  ...dateRangeKeys(DATE_COLUMNS),
  ATTENTION_COLUMN,
]);

/** Estado de la tabla ya parseado y con solo los filtros permitidos. */
function parseListState(searchParams: DataTableSearchParams) {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

type TableState = ReturnType<typeof parseListState>;

/** "00003-00000124", "3-124" (punto de venta + número) o "124" (solo número). */
const VOUCHER_RE = /^\s*(?:(\d{1,5})\s*-\s*)?(\d{1,8})\s*$/;

// ============================================================================
// WHERE
// ============================================================================

/**
 * WHERE compartido entre la query paginada, el export, las facetas y los conteos del tablero. Todo
 * cuelga de un único `AND` con el perímetro de empresa primero: ningún filtro puede pisarlo.
 */
function buildWhereClause(companyId: string, canViewPrices: boolean, state: TableState): Prisma.invoicesWhereInput {
  const and: Prisma.invoicesWhereInput[] = [{ company_id: companyId }];

  // Búsqueda global: número de comprobante, CAE o cliente
  const search = state.search.trim();
  if (search) {
    const or: Prisma.invoicesWhereInput[] = [
      { cae: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
    const voucher = VOUCHER_RE.exec(search);
    if (voucher) {
      or.push(
        voucher[1]
          ? { sales_point: { number: Number(voucher[1]) }, number: Number(voucher[2]) }
          : { number: Number(voucher[2]) }
      );
    }
    and.push({ OR: or });
  }

  and.push(
    buildFiltersWhere(state.filters, FACETED_COLUMN_MAP, {
      exclude: [...MANUAL_FILTER_COLUMNS, ...TEXT_COLUMNS, ...dateRangeKeys(DATE_COLUMNS), ATTENTION_COLUMN],
    }) as Prisma.invoicesWhereInput
  );
  and.push(buildTextFiltersWhere(state.filters, TEXT_COLUMNS) as Prisma.invoicesWhereInput);
  and.push(buildDateRangeFiltersWhere(state.filters, DATE_COLUMNS) as Prisma.invoicesWhereInput);

  // Tarjetas del tablero: misma condición que el conteo de la tarjeta
  const attention = state.filters[ATTENTION_COLUMN]?.[0];
  if (isInvoiceAttentionKey(attention)) and.push(invoiceAttentionWhere(attention, new Date()));

  // Tipo de comprobante (Int)
  const cbteTypes = state.filters.cbte_type?.map(Number).filter((n) => !isNaN(n));
  if (cbteTypes?.length) and.push({ cbte_type: { in: cbteTypes } });

  // Simulado (boolean desde string): con ambos valores marcados no filtra
  const simulated = state.filters.simulated?.filter((v) => v === 'true' || v === 'false');
  if (simulated?.length === 1) and.push({ simulated: simulated[0] === 'true' });

  // Número: coincidencia exacta
  const voucherFilter = state.filters.voucher_number?.[0];
  if (voucherFilter) {
    const match = VOUCHER_RE.exec(voucherFilter);
    if (!match) {
      and.push({ id: { in: [] } });
    } else if (match[1]) {
      and.push({ sales_point: { number: Number(match[1]) }, number: Number(match[2]) });
    } else {
      and.push({ number: Number(match[2]) });
    }
  }

  // CUIT del cliente: solo dígitos, coincidencia exacta
  const rawCuit = state.filters.cuit?.[0];
  if (rawCuit) {
    const digits = rawCuit.replace(/\D/g, '');
    and.push(digits ? { customer: { cuit: BigInt(digits) } } : { id: { in: [] } });
  }

  // Total: solo con view_prices; coincidencia exacta del importe
  const totalFilter = state.filters.total?.[0];
  if (canViewPrices && totalFilter) {
    const normalized = totalFilter.trim().replace(',', '.');
    and.push(/^\d+(\.\d{1,2})?$/.test(normalized) ? { total: normalized } : { id: { in: [] } });
  }

  return { AND: and };
}

/** Multi-sort del usuario (solo campos válidos) y, de fondo, fecha de emisión descendente. */
function buildOrderBy(state: TableState, canViewPrices: boolean): Prisma.invoicesOrderByWithRelationInput[] {
  const resolved: Record<string, unknown>[] = [];
  for (const s of state.sorting) {
    if (!VALID_SORT_FIELDS.has(s.id)) continue;
    if (s.id === 'total' && !canViewPrices) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = FK_SORT_MAP[s.id];
    resolved.push(mapper ? mapper(dir) : { [s.id]: dir });
  }
  return [
    ...resolved,
    { issue_date: 'desc' },
    { created_at: 'desc' },
    { id: 'asc' },
  ] as Prisma.invoicesOrderByWithRelationInput[];
}

// ============================================================================
// SELECT / MAPPING
// ============================================================================

const INVOICE_SELECT = {
  id: true,
  cbte_type: true,
  number: true,
  status: true,
  environment: true,
  simulated: true,
  issue_date: true,
  currency: true,
  total: true,
  cae: true,
  cae_due_date: true,
  created_at: true,
  sales_point: { select: { id: true, number: true, name: true } },
  customer: { select: { id: true, name: true, cuit: true } },
} satisfies Prisma.invoicesSelect;

type InvoiceRow = Prisma.invoicesGetPayload<{ select: typeof INVOICE_SELECT }>;

/** Serializa para el cliente: fechas `YYYY-MM-DD`, importe como texto (nunca Number). */
function mapInvoice(row: InvoiceRow, canViewPrices: boolean) {
  return {
    id: row.id,
    cbteType: row.cbte_type,
    cbteLabel: cbteLabel(row.cbte_type),
    number: row.number,
    voucherNumber: formatVoucherNumber(row.sales_point.number, row.number),
    status: row.status,
    environment: row.environment,
    simulated: row.simulated,
    issueDate: toDateOnly(row.issue_date) ?? '',
    currency: row.currency,
    total: canViewPrices ? row.total.toFixed(2) : null,
    cae: row.cae,
    caeDueDate: toDateOnly(row.cae_due_date),
    createdAt: row.created_at.toISOString(),
    salesPoint: { id: row.sales_point.id, number: row.sales_point.number, name: row.sales_point.name },
    customer: { id: row.customer.id, name: row.customer.name, cuit: String(row.customer.cuit) },
  };
}

async function loadContext() {
  const companyId = await getActiveCompanyId();
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'facturacion', 'view'),
    checkPermissionServer('comercial', 'facturacion', 'view_prices'),
  ]);
  if (!canView) throw new Error('No tenés permiso para ver los comprobantes.');
  return { companyId, canViewPrices };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getInvoicesPaginated(searchParams: DataTableSearchParams) {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, canViewPrices, state);

    const [rows, total] = await Promise.all([
      prisma.invoices.findMany({
        skip,
        take,
        where,
        orderBy: buildOrderBy(state, canViewPrices),
        select: INVOICE_SELECT,
      }),
      prisma.invoices.count({ where }),
    ]);

    return { data: rows.map((r) => mapInvoice(r, canViewPrices)), total };
  } catch (error) {
    logger.error('Error al obtener comprobantes paginados', { data: { error } });
    throw new Error('No se pudieron obtener los comprobantes. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT (sin paginación)
// ============================================================================

/** Tope de comprobantes por export: más que esto se pide acotar con filtros. */
const EXPORT_MAX_INVOICES = 10_000;

export async function getInvoicesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<InvoiceListItem[]>> {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, canViewPrices, state);
    const orderBy = buildOrderBy(state, canViewPrices);

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_INVOICES,
      listIds: (take) => prisma.invoices.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.invoices.findMany({ where: { id: { in: ids }, company_id: companyId }, select: INVOICE_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} comprobantes con los filtros actuales. Acote la exportación con filtros.`,
    });

    return { ok: true, data: rows.map((r) => mapInvoice(r, canViewPrices)) };
  } catch (error) {
    logger.error('Error al exportar comprobantes', { data: { error } });
    return exportFailure(error, 'No se pudo exportar el listado. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

type InvoiceFacetWhere = Prisma.invoicesWhereInput;

/** Configuración de cada faceta: columna a agrupar y, si es FK, cómo resolver las etiquetas. */
function facetConfigs(companyId: string): Record<string, FacetConfig<InvoiceFacetWhere>> {
  return {
    cbte_type: {
      kind: 'direct',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['cbte_type'], where, _count: true })).map((r) => ({
          key: String(r.cbte_type),
          count: r._count,
        })),
    },
    status: {
      kind: 'direct',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['status'], where, _count: true })).map((r) => ({
          key: r.status,
          count: r._count,
        })),
    },
    environment: {
      kind: 'direct',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['environment'], where, _count: true })).map((r) => ({
          key: r.environment,
          count: r._count,
        })),
    },
    simulated: {
      kind: 'direct',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['simulated'], where, _count: true })).map((r) => ({
          key: r.simulated,
          count: r._count,
        })),
    },
    currency: {
      kind: 'direct',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['currency'], where, _count: true })).map((r) => ({
          key: r.currency,
          count: r._count,
        })),
    },
    sales_point: {
      kind: 'lookup',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['sales_point_id'], where, _count: true })).map((r) => ({
          key: r.sales_point_id,
          count: r._count,
        })),
      lookup: async (ids) => {
        const rows = await prisma.sales_points.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: { id: true, number: true, name: true },
        });
        return new Map(
          rows.map((o) => [o.id, { value: o.id, label: `${String(o.number).padStart(5, '0')} - ${o.name}` }])
        );
      },
    },
    customer: {
      kind: 'lookup',
      group: async (where) =>
        (await prisma.invoices.groupBy({ by: ['customer_id'], where, _count: true })).map((r) => ({
          key: r.customer_id,
          count: r._count,
        })),
      lookup: async (ids) => {
        const rows = await prisma.customers.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: { id: true, name: true },
        });
        return new Map(rows.map((o) => [o.id, { value: o.id, label: o.name }]));
      },
    },
  };
}

/** Facetas cuyas opciones vienen del servidor (el resto las arma el cliente con sus etiquetas). */
const SERVER_OPTION_FACETS = new Set(['currency', 'sales_point', 'customer']);

export async function getInvoiceSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const config = facetConfigs(companyId)[columnId];
    if (!config) return null;

    // Cross-filter: todos los filtros activos EXCEPTO el de la propia columna
    const baseState = parseListState(searchParams ?? {});
    const where = buildWhereClause(companyId, canViewPrices, withoutOwnFilter(baseState, columnId));

    const { counts, resolvedOptions } = await runFacet(config, where);
    return SERVER_OPTION_FACETS.has(columnId)
      ? { counts, resolvedOptions: resolvedOptions.map((o) => ({ id: o.value, name: o.label })) }
      : { counts };
  } catch (error) {
    logger.error('Error al obtener facetas de comprobantes', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TABLERO: conteos de las tarjetas
// ============================================================================

export type InvoicingMetrics = Record<InvoiceAttentionKey, number>;

/**
 * Conteos del tablero. Cada uno usa `buildWhereClause` con el filtro virtual `attention` de la tarjeta:
 * el mismo `where` que el listado, así el número de la tarjeta es el total de la tabla filtrada por ella.
 * Nunca rechaza: devuelve `null` si no se pudo contar (las tarjetas muestran "—").
 */
export async function getInvoicingMetrics(): Promise<InvoicingMetrics | null> {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const base = parseListState({});
    const counts = await Promise.all(
      INVOICE_ATTENTION_KEYS.map((key) =>
        prisma.invoices.count({
          where: buildWhereClause(companyId, canViewPrices, { ...base, filters: { [ATTENTION_COLUMN]: [key] } }),
        })
      )
    );
    return Object.fromEntries(INVOICE_ATTENTION_KEYS.map((key, i) => [key, counts[i]])) as InvoicingMetrics;
  } catch (error) {
    logger.error('Error al contar los comprobantes del tablero', { data: { error } });
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type InvoiceListItem = Awaited<ReturnType<typeof getInvoicesPaginated>>['data'][number];
