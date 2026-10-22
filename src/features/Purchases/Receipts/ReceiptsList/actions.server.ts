'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
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
import { getReceiptsSectionCount } from '../../lib/section-counts';
import { RECEIPT_STATUS_ACTIVE as STATUS_ACTIVE, RECEIPT_STATUS_CANCELLED as STATUS_CANCELLED } from './constants';

const logger = new Logger('features/Purchases/Receipts/ReceiptsList');

type ReceiptWhere = Prisma.purchase_receiptsWhereInput;
type ReceiptOrderBy = Prisma.purchase_receiptsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseListState>;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ordenables (campos directos). Las FK y el estado se resuelven en FK_SORT_MAP. */
const VALID_SORT_FIELDS = new Set(['number', 'received_on', 'delivery_note', 'created_at']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => ReceiptOrderBy> = {
  order: (dir) => ({ order: { number: dir } }),
  supplier: (dir) => ({ supplier: { name: dir } }),
  warehouse: (dir) => ({ warehouse: { name: dir } }),
  creator: (dir) => ({ creator: { fullname: dir } }),
  // Estado derivado de cancelled_at: "Vigente" (null) primero en asc
  status: (dir) => ({
    cancelled_at: { sort: dir === 'asc' ? 'desc' : 'asc', nulls: dir === 'asc' ? 'first' : 'last' },
  }),
};

const TEXT_FILTER_COLUMNS = ['number', 'delivery_note'];
const DATE_RANGE_COLUMNS = ['received_on', 'created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas). */
const FACETED_COLUMNS = ['order', 'supplier', 'warehouse', 'creator'] as const;

/** columnId (URL) -> campo Prisma. */
const COLUMN_MAP: Record<string, string> = {
  order: 'order_id',
  supplier: 'supplier_id',
  warehouse: 'warehouse_id',
  creator: 'created_by',
};

const REQUESTS_FILTER = 'requests';

/** Unicas claves de filtro que se aceptan: cualquier otra de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...FACETED_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
  'status',
  REQUESTS_FILTER,
]);

/** Filtros que no pasan por `buildFiltersWhere` (texto, estado derivado y M:M se arman a mano). */
const MANUAL_FILTERS = [...TEXT_FILTER_COLUMNS, 'status', REQUESTS_FILTER];

/** Tope de filas del export. */
const EXPORT_MAX_ROWS = 10_000;

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: (v) => v === STATUS_ACTIVE || v === STATUS_CANCELLED,
  order: isUuid,
  supplier: isUuid,
  warehouse: isUuidOrNull,
  creator: isUuid,
  [REQUESTS_FILTER]: isUuidOrNull,
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
const resolveCompanyId = () => companyIdIfCanView('recepciones');

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  return parseValidatedListState(searchParams, ALLOWED_FILTER_KEYS, VALID_VALUES);
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): ReceiptWhere {
  const f = state.filters;
  const and: ReceiptWhere[] = [{ company_id: companyId }];

  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        { number: contains(search) },
        { delivery_note: contains(search) },
        { order: { number: contains(search) } },
        { supplier: { OR: [{ name: contains(search) }, { trade_name: contains(search) }] } },
      ],
    });
  }

  and.push(buildFiltersWhere(f, COLUMN_MAP, { exclude: MANUAL_FILTERS }) as ReceiptWhere);
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as ReceiptWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as ReceiptWhere);

  // Estado derivado de cancelled_at (ambos valores = sin filtro)
  const wantsActive = f.status?.includes(STATUS_ACTIVE) ?? false;
  const wantsCancelled = f.status?.includes(STATUS_CANCELLED) ?? false;
  if (wantsActive && !wantsCancelled) and.push({ cancelled_at: null });
  if (wantsCancelled && !wantsActive) and.push({ cancelled_at: { not: null } });

  // Solicitudes de origen (M:M via lineas -> linea de OC -> linea de solicitud)
  const requestIds = f[REQUESTS_FILTER]?.filter((v) => v !== NULL_FILTER_VALUE) ?? [];
  if (requestIds.length > 0) {
    and.push({ lines: { some: { order_line: { request_line: { request_id: { in: requestIds } } } } } });
  }

  return { AND: and };
}

const RECEIPT_SELECT = {
  id: true,
  number: true,
  received_on: true,
  delivery_note: true,
  created_at: true,
  cancelled_at: true,
  order: { select: { id: true, number: true } },
  supplier: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  creator: { select: { id: true, fullname: true, email: true } },
  lines: {
    select: {
      order_line: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } },
    },
  },
} as const;

function shape(rows: Prisma.purchase_receiptsGetPayload<{ select: typeof RECEIPT_SELECT }>[]) {
  return rows.map((r) => {
    return {
      id: r.id,
      number: r.number,
      received_on: r.received_on,
      delivery_note: r.delivery_note,
      created_at: r.created_at,
      cancelled: r.cancelled_at != null,
      order: r.order,
      supplier: r.supplier,
      warehouse: r.warehouse,
      creator: { id: r.creator.id, name: profileDisplayName(r.creator) },
      requests: uniqueSortedByNumber(r.lines.map((l) => l.order_line.request_line.request)),
    };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getPurchaseReceiptsPaginated(searchParams: DataTableSearchParams) {
  const companyId = await resolveCompanyId();
  if (!companyId) return { data: [], total: 0 };

  try {
    const state = parseListState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const orderBy: ReceiptOrderBy[] = [
      ...resolveSorts<ReceiptOrderBy>(state.sorting, VALID_SORT_FIELDS, FK_SORT_MAP),
      { received_on: 'desc' },
      { number: 'desc' },
    ];

    const [rows, total] = await Promise.all([
      prisma.purchase_receipts.findMany({ where, orderBy, skip, take, select: RECEIPT_SELECT }),
      prisma.purchase_receipts.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener recepciones', { data: { error } });
    throw new Error('No se pudo obtener la lista de recepciones');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllPurchaseReceiptsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PurchaseReceiptListItem[]>> {
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: true, data: [] };

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy: ReceiptOrderBy[] = [{ received_on: 'desc' }, { number: 'desc' }, { id: 'asc' }];

    const rows = await fetchExportRowsInBatches({
      maxRows: EXPORT_MAX_ROWS,
      listIds: (take) => prisma.purchase_receipts.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.purchase_receipts.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: RECEIPT_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('recepciones'),
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar recepciones', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de recepciones. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPurchaseReceiptSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): ReceiptWhere {
    return buildWhereClause(companyId as string, withoutOwnFilter(parsed ?? parseListState({}), excludeColumn));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const [active, cancelled] = await Promise.all([
        prisma.purchase_receipts.count({ where: { AND: [where, { cancelled_at: null }] } }),
        prisma.purchase_receipts.count({ where: { AND: [where, { cancelled_at: { not: null } }] } }),
      ]);
      return {
        counts: new Map([
          [STATUS_ACTIVE, active],
          [STATUS_CANCELLED, cancelled],
        ]),
      };
    }

    if (columnId === 'order') {
      const rows = await prisma.purchase_receipts.groupBy({ by: ['order_id'], where, _count: true });
      const ids = rows.map((r) => r.order_id);
      const orders = ids.length
        ? await prisma.purchase_orders.findMany({
            where: { id: { in: ids } },
            select: { id: true, number: true },
            orderBy: { number: 'desc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.order_id, count: r._count }))),
        resolvedOptions: orders.map((o) => ({ id: o.id, name: o.number })),
      };
    }

    if (columnId === 'supplier') {
      const rows = await prisma.purchase_receipts.groupBy({ by: ['supplier_id'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: await supplierFacetOptions(rows.map((r) => r.supplier_id)),
      };
    }

    if (columnId === 'warehouse') {
      const rows = await prisma.purchase_receipts.groupBy({ by: ['warehouse_id'], where, _count: true });
      const ids = rows.flatMap((r) => (r.warehouse_id ? [r.warehouse_id] : []));
      const warehouses = ids.length
        ? await prisma.warehouses.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.warehouse_id, count: r._count }))),
        resolvedOptions: warehouses,
      };
    }

    if (columnId === 'creator') {
      const rows = await prisma.purchase_receipts.groupBy({ by: ['created_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: await profileFacetOptions(rows.map((r) => r.created_by)),
      };
    }

    if (columnId === 'requests') {
      // M:M: cuantas recepciones (distintas) tiene cada solicitud de origen
      const receipts = await prisma.purchase_receipts.findMany({
        where,
        select: {
          lines: {
            select: {
              order_line: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } },
            },
          },
        },
      });
      return countDistinctRelations(receipts.map((r) => r.lines.map((l) => l.order_line.request_line.request)));
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de recepciones', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// BANDA DE ATENCION
// ============================================================================

/**
 * Ordenes de compra pendientes de recibir (enviadas o recibidas en parte), para quien puede registrar
 * recepciones. Usa el mismo conteo que el contador de la sub-navegacion (`getReceiptsSectionCount`), asi
 * ambos numeros coinciden. Nunca rechaza: `null` si no corresponde o no se pudo contar.
 */
export async function getPurchaseReceiptsAttention(): Promise<{
  pendingToReceive: number;
  canViewOrders: boolean;
} | null> {
  try {
    const pendingToReceive = await getReceiptsSectionCount();
    if (pendingToReceive == null) return null;
    return { pendingToReceive, canViewOrders: await checkPermissionServer('compras', 'ordenes', 'view') };
  } catch (error) {
    logger.error('Error al contar ordenes pendientes de recibir', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type PurchaseReceiptListItem = Awaited<ReturnType<typeof getPurchaseReceiptsPaginated>>['data'][number];
