'use server';

import { formatVoucherNumber } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  NULL_FILTER_VALUE,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { profileFacetOptions } from '@/shared/lib/table-facet-lookups';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import {
  containsInsensitive as contains,
  isUuidOrNull,
  parseValidatedListState,
  profileDisplayName,
  resolveSorts,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { ARCA_CHECK_LABELS, SUPPLIER_INVOICE_STATUS_LABELS } from '../../lib/invoice-status';
import { supplierInvoiceLabel } from '../../lib/invoices';
import { supplierFacetOptions } from '../../lib/list-facet-lookups';
import { digitsOf, parseAmountFilter, voucherNumberWhere } from '../../lib/list-filters';
import { getInvoicesSectionCount } from '../../lib/section-counts';
import { formatCuit } from '../../lib/supplier-ids';
import { INVOICE_CBTE_TYPE_IDS } from './constants';

const logger = new Logger('features/Purchases/Invoices/InvoicesList');

type InvoiceWhere = Prisma.supplier_invoicesWhereInput;
type InvoiceOrderBy = Prisma.supplier_invoicesOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y los compuestos se resuelven en SORT_MAP. */
const VALID_SORT_FIELDS = new Set([
  'cbte_type',
  'issue_date',
  'vat_period',
  'total',
  'due_date',
  'status',
  'arca_check_result',
  'created_at',
]);

const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => InvoiceOrderBy[]> = {
  number: (dir) => [{ sales_point: dir }, { number: dir }],
  supplier: (dir) => [{ supplier: { name: dir } }],
  supplier_cuit: (dir) => [{ supplier: { cuit: dir } }],
  creator: (dir) => [{ creator: { fullname: dir } }],
};

const DATE_RANGE_COLUMNS = ['issue_date', 'due_date', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['supplier', 'vat_period', 'status', 'arca_check_result', 'creator'] as const;

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = {
  supplier: 'supplier_id',
  vat_period: 'vat_period',
  status: 'status',
  arca_check_result: 'arca_check_result',
  creator: 'created_by',
};

/** Filtros de texto/propios que no pasan por `buildFiltersWhere`. */
const OWN_FILTERS = ['cbte_type', 'number', 'supplier_cuit', 'total', 'orders'] as const;

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...OWN_FILTERS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: (v) => v in SUPPLIER_INVOICE_STATUS_LABELS,
  arca_check_result: (v) => v === NULL_FILTER_VALUE || v in ARCA_CHECK_LABELS,
  supplier: isUuid,
  creator: isUuid,
  vat_period: (v) => /^\d{4}-\d{2}$/.test(v),
  cbte_type: (v) => (INVOICE_CBTE_TYPE_IDS as readonly number[]).includes(Number(v)),
  orders: isUuidOrNull,
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('compras', 'facturas', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** Ids de proveedores de la empresa cuyo CUIT contiene los digitos (columna bigint: busqueda por texto en SQL). */
async function supplierIdsByCuit(companyId: string, digits: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM suppliers WHERE company_id = ${companyId}::uuid AND cuit::text LIKE ${`%${digits}%`}
  `;
  return rows.map((r) => r.id);
}

/** WHERE compartido entre paginated, export y facets. */
async function buildWhereClause(companyId: string, state: FilterState): Promise<InvoiceWhere> {
  const f = state.filters;
  const and: InvoiceWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    const or: InvoiceWhere[] = [{ supplier: { OR: [{ name: contains(search) }, { trade_name: contains(search) }] } }];
    const byNumber = /^[\d-]+$/.test(search) ? voucherNumberWhere(search) : null;
    if (byNumber) or.push(byNumber);
    and.push({ OR: or });
  }

  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...OWN_FILTERS] }) as InvoiceWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as InvoiceWhere);

  // Text: comprobante (exacto), CUIT (parcial, bigint) y total (exacto, decimal)
  const numberText = f.number?.[0]?.trim();
  if (numberText) and.push(voucherNumberWhere(numberText) ?? { id: { in: [] } });

  const cuitDigits = digitsOf(f.supplier_cuit?.[0] ?? '');
  if (cuitDigits) and.push({ supplier_id: { in: await supplierIdsByCuit(companyId, cuitDigits) } });

  const totalText = f.total?.[0]?.trim();
  if (totalText) {
    const amount = parseAmountFilter(totalText);
    and.push(amount ? { total: amount } : { id: { in: [] } });
  }

  // Tipo de comprobante (Int): conversion manual
  const cbteTypes = f.cbte_type?.map(Number).filter((n) => !Number.isNaN(n));
  if (cbteTypes?.length) and.push({ cbte_type: { in: cbteTypes } });

  // OC vinculadas (M:M via lineas); NULL_FILTER_VALUE = sin lineas de OC (gastos)
  const orderValues = f.orders ?? [];
  if (orderValues.length > 0) {
    const wantsNone = orderValues.includes(NULL_FILTER_VALUE);
    const orderIds = orderValues.filter((v) => v !== NULL_FILTER_VALUE);
    const conditions: InvoiceWhere[] = [];
    if (orderIds.length) conditions.push({ lines: { some: { order_line: { order_id: { in: orderIds } } } } });
    if (wantsNone) conditions.push({ lines: { none: { order_line_id: { not: null } } } });
    and.push(conditions.length === 1 ? conditions[0] : { OR: conditions });
  }

  return { AND: and };
}

const INVOICE_SELECT = {
  id: true,
  cbte_type: true,
  sales_point: true,
  number: true,
  issue_date: true,
  due_date: true,
  vat_period: true,
  total: true,
  status: true,
  arca_check_result: true,
  created_at: true,
  supplier: { select: { id: true, name: true, cuit: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  lines: { select: { order_line: { select: { order: { select: { id: true, number: true } } } } } },
} as const;

function shape(rows: Prisma.supplier_invoicesGetPayload<{ select: typeof INVOICE_SELECT }>[]) {
  return rows.map((r) => {
    const orders = new Map<string, { id: string; number: string }>();
    for (const l of r.lines) if (l.order_line) orders.set(l.order_line.order.id, l.order_line.order);

    return {
      id: r.id,
      label: supplierInvoiceLabel(r),
      voucher_number: formatVoucherNumber(r.sales_point, Number(r.number)),
      cbte_type: r.cbte_type,
      issue_date: r.issue_date,
      due_date: r.due_date,
      vat_period: r.vat_period,
      total: r.total.toString(),
      status: r.status,
      arca_check_result: r.arca_check_result,
      created_at: r.created_at,
      supplier: { id: r.supplier.id, name: r.supplier.name, cuit: formatCuit(r.supplier.cuit) },
      creator: { id: r.creator.id, name: profileDisplayName(r.creator) },
      orders: [...orders.values()].sort((a, b) => a.number.localeCompare(b.number)),
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getSupplierInvoicesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(companyId, state);

    const orderBy: InvoiceOrderBy[] = [
      ...resolveSorts<InvoiceOrderBy>(state.sorting, VALID_SORT_FIELDS, SORT_MAP),
      { issue_date: 'desc' },
      { created_at: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.supplier_invoices.findMany({ where, orderBy, skip, take, select: INVOICE_SELECT }),
      prisma.supplier_invoices.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener comprobantes de proveedor', { data: { error } });
    throw new Error('No se pudo obtener la lista de comprobantes');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllSupplierInvoicesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<SupplierInvoiceListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = await buildWhereClause(companyId, state);
    const orderBy: InvoiceOrderBy[] = [{ issue_date: 'desc' }, { created_at: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.supplier_invoices.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.supplier_invoices.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: INVOICE_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} comprobantes con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar comprobantes de proveedor', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en produccion.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de comprobantes. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getSupplierInvoiceSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): Promise<InvoiceWhere> {
    return buildWhereClause(companyId as string, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = await crossWhere(columnId);

    if (columnId === 'cbte_type') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['cbte_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.cbte_type, count: r._count }))) };
    }

    if (columnId === 'status') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'arca_check_result') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['arca_check_result'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.arca_check_result, count: r._count }))) };
    }

    if (columnId === 'vat_period') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['vat_period'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.vat_period, count: r._count }))),
        resolvedOptions: rows
          .map((r) => ({ id: r.vat_period, name: r.vat_period }))
          .sort((a, b) => b.id.localeCompare(a.id)),
      };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['supplier_id'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: await supplierFacetOptions(rows.map((r) => r.supplier_id)),
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.supplier_invoices.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'orders') {
      // M:M: cuantos comprobantes (distintos) tiene cada OC; sin lineas de OC = "Sin OC"
      const invoices = await prisma.supplier_invoices.findMany({
        where,
        select: { lines: { select: { order_line: { select: { order: { select: { id: true, number: true } } } } } } },
      });
      const counts = new Map<string, number>();
      const names = new Map<string, string>();
      for (const inv of invoices) {
        const seen = new Set<string>();
        for (const l of inv.lines) {
          const order = l.order_line?.order;
          if (!order) continue;
          names.set(order.id, order.number);
          if (!seen.has(order.id)) {
            seen.add(order.id);
            counts.set(order.id, (counts.get(order.id) ?? 0) + 1);
          }
        }
        if (seen.size === 0) counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
      }
      const resolvedOptions = [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => b.name.localeCompare(a.name));
      return { counts, resolvedOptions };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de comprobantes', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCION (banda sobre la tabla)
// ============================================================================

/**
 * Facturas observadas que esperan decision (`facturas:approve`). Usa el mismo contador que la sub-navegacion
 * (`getInvoicesSectionCount`), que es el `where` de la lista filtrada por estado Observada. Nunca rechaza:
 * `null` si no corresponde o no se pudo contar (no se muestra la banda).
 */
export async function getSupplierInvoicesAttention(): Promise<{ observed: number } | null> {
  try {
    if (!(await checkPermissionServer('compras', 'facturas', 'view'))) return null;
    const observed = await getInvoicesSectionCount();
    return observed == null ? null : { observed };
  } catch (error) {
    logger.error('Error al contar facturas observadas', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type SupplierInvoiceListItem = Awaited<ReturnType<typeof getSupplierInvoicesPaginated>>['data'][number];
