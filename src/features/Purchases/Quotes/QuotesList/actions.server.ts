'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportFailure, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { profileFacetOptions } from '@/shared/lib/table-facet-lookups';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys } from '@/shared/lib/table-filters';
import {
  containsInsensitive as contains,
  countDistinctRelations,
  isOneOf,
  isUuidOrNull,
  parseValidatedListState,
  profileDisplayName,
  resolveSorts,
  uniqueSortedByNumber,
  type SingleFacetResult,
} from '@/shared/lib/table-list-query';
import { isUuid } from '@/shared/lib/uuid';
import { companyIdIfCanView } from '../../lib/list-access';
import { supplierFacetOptions } from '../../lib/list-facet-lookups';
import { computeOrderTotals } from '../../lib/order-totals';
import { canViewPurchasePrices } from '../../lib/price-visibility.server';
import { PURCHASE_QUOTE_STATUSES } from '../../lib/quote-state-machine';

const logger = new Logger('features/Purchases/Quotes/QuotesList');

type QuoteWhere = Prisma.purchase_quotesWhereInput;
type QuoteOrderBy = Prisma.purchase_quotesOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). `supplier` / `creator` se resuelven en FK_SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['number', 'status', 'created_at', 'sent_at', 'received_at', 'valid_until']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => QuoteOrderBy> = {
  supplier: (dir) => ({ supplier: { name: dir } }),
  creator: (dir) => ({ creator: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number'];
const DATE_RANGE_COLUMNS = ['created_at', 'sent_at', 'received_at', 'valid_until'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['status', 'supplier', 'creator'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  supplier: 'supplier_id',
  creator: 'created_by',
};

/** Filtro de solicitudes de origen (M:M via lineas): se resuelve a mano. */
const REQUESTS_FILTER = 'requests';

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  REQUESTS_FILTER,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: isOneOf(PURCHASE_QUOTE_STATUSES),
  supplier: isUuid,
  creator: isUuid,
  [REQUESTS_FILTER]: isUuidOrNull,
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
const resolveCompanyId = () => companyIdIfCanView('cotizaciones');

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): QuoteWhere {
  const f = state.filters;
  const and: QuoteWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { supplier: { OR: [{ name: contains(search) }, { trade_name: contains(search) }] } },
      ],
    });
  }

  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: [...TEXT_FILTER_COLUMNS, REQUESTS_FILTER] }) as QuoteWhere);
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as QuoteWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as QuoteWhere);

  // Solicitudes de origen (M:M via lineas): alcanza con que una linea venga de alguna de las elegidas
  const requestIds = f[REQUESTS_FILTER]?.filter((v) => v !== NULL_FILTER_VALUE) ?? [];
  if (requestIds.length > 0) {
    and.push({ lines: { some: { request_line: { request_id: { in: requestIds } } } } });
  }

  return { AND: and };
}

const QUOTE_SELECT = {
  id: true,
  number: true,
  status: true,
  created_at: true,
  sent_at: true,
  received_at: true,
  valid_until: true,
  supplier: { select: { id: true, name: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  lines: {
    select: {
      quantity: true,
      unit_price: true,
      vat_rate_id: true,
      not_quoted: true,
      request_line: { select: { request: { select: { id: true, number: true } } } },
    },
  },
} as const;

function shape(rows: Prisma.purchase_quotesGetPayload<{ select: typeof QUOTE_SELECT }>[], canViewPrices: boolean) {
  return rows.map((r) => {
    // Total cotizado: solo lineas con precio y alicuota (las "no cotizadas" quedan afuera)
    const priced = r.lines.filter((l) => !l.not_quoted && l.unit_price != null && l.vat_rate_id != null);
    // Sin `view_prices` no se calcula ni viaja (la UI muestra "Sin permiso").
    const total_quoted =
      canViewPrices && priced.length > 0
        ? computeOrderTotals(
            priced.map((l) => ({
              quantity: l.quantity.toFixed(),
              unitPrice: (l.unit_price as Prisma.Decimal).toFixed(),
              vatRateId: l.vat_rate_id as number,
            }))
          ).total
        : null;

    return {
      id: r.id,
      number: r.number,
      status: r.status,
      created_at: r.created_at,
      sent_at: r.sent_at,
      received_at: r.received_at,
      valid_until: r.valid_until,
      supplier: r.supplier,
      creator: { id: r.creator.id, name: profileDisplayName(r.creator) },
      total_quoted,
      requests: uniqueSortedByNumber(r.lines.map((l) => l.request_line.request)),
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPurchaseQuotesPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0, canViewPrices: false };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const orderBy: QuoteOrderBy[] = [
      ...resolveSorts<QuoteOrderBy>(state.sorting, VALID_SORT_FIELDS, FK_SORT_MAP),
      { created_at: 'desc' },
      { number: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.purchase_quotes.findMany({ where, orderBy, skip, take, select: QUOTE_SELECT }),
      prisma.purchase_quotes.count({ where }),
    ]);
    const canViewPrices = await canViewPurchasePrices('cotizaciones');
    return { data: shape(rows, canViewPrices), total, canViewPrices };
  } catch (error) {
    logger.error('Error al obtener pedidos de cotizacion', { data: { error } });
    throw new Error('No se pudo obtener la lista de pedidos de cotización');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllPurchaseQuotesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PurchaseQuoteListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: QuoteOrderBy[] = [{ created_at: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.purchase_quotes.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.purchase_quotes.findMany({ where: { id: { in: ids }, company_id: companyId }, select: QUOTE_SELECT }),
      tooLargeMessage: tooManyRowsMessage('pedidos de cotización'),
    });
    return { ok: true, data: shape(rows, await canViewPurchasePrices('cotizaciones')) };
  } catch (error) {
    logger.error('Error al exportar pedidos de cotizacion', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de pedidos de cotización. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPurchaseQuoteSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): QuoteWhere {
    return buildWhereClause(companyId as string, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.purchase_quotes.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.purchase_quotes.groupBy({ by: ['supplier_id'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: await supplierFacetOptions(rows.map((r) => r.supplier_id)),
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.purchase_quotes.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'requests') {
      // M:M: cuantos pedidos de cotizacion (distintos) tiene cada solicitud de origen
      const quotes = await prisma.purchase_quotes.findMany({
        where,
        select: {
          lines: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } },
        },
      });
      return countDistinctRelations(quotes.map((q) => q.lines.map((l) => l.request_line.request)));
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de pedidos de cotizacion', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// BANDA DE ATENCION
// ============================================================================

/**
 * Pedidos de cotizacion enviados que todavia no tienen respuesta (estado `SENT`: de ahi salen solo
 * `receive` o `decline`). La maquina de estados no define un plazo, asi que no hay umbral de dias: se
 * cuentan todas las enviadas. El numero usa el WHERE de la lista con `status=SENT`, asi coincide con el
 * total de la tabla filtrada. Nunca rechaza: `null` si no se pudo contar (la banda no se muestra).
 */
export async function getPurchaseQuotesAttention(): Promise<{ awaitingResponse: number } | null> {
  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return null;
    const state = parseListState({ status: 'SENT' });
    const awaitingResponse = await prisma.purchase_quotes.count({ where: buildWhereClause(companyId, state) });
    return { awaitingResponse };
  } catch (error) {
    logger.error('Error al contar cotizaciones sin respuesta', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type PurchaseQuoteListItem = Awaited<ReturnType<typeof getPurchaseQuotesPaginated>>['data'][number];
