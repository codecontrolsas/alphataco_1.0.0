'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
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
  status: (dir) => ({ cancelled_at: { sort: dir === 'asc' ? 'desc' : 'asc', nulls: dir === 'asc' ? 'first' : 'last' } }),
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

/** Valores validos por columna con lista cerrada (un valor ajeno haria fallar a Prisma y tumbaria la lista). */
const VALID_VALUES: Record<string, (value: string) => boolean> = {
  status: (v) => v === STATUS_ACTIVE || v === STATUS_CANCELLED,
  order: isUuid,
  supplier: isUuid,
  warehouse: (v) => v === NULL_FILTER_VALUE || isUuid(v),
  creator: isUuid,
  [REQUESTS_FILTER]: (v) => v === NULL_FILTER_VALUE || isUuid(v),
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Empresa si el usuario puede ver la tabla; `null` = sin acceso -> lista vacia. */
async function resolveCompanyId(): Promise<string | null> {
  const canView = await checkPermissionServer('compras', 'recepciones', 'view');
  if (!canView) return null;
  return getActiveCompanyId();
}

/** Estado de la tabla ya parseado, con solo los filtros permitidos y sus valores validos. */
function parseListState(searchParams: DataTableSearchParams) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  for (const [column, isValid] of Object.entries(VALID_VALUES)) {
    const values = state.filters[column];
    if (!values) continue;
    const valid = values.filter(isValid);
    if (valid.length > 0) state.filters[column] = valid;
    else delete state.filters[column];
  }
  return state;
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
  lines: { select: { order_line: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } } } },
} as const;

const profileName = (p: { fullname: string | null; email: string | null }) => p.fullname ?? p.email ?? '-';

function shape(rows: Prisma.purchase_receiptsGetPayload<{ select: typeof RECEIPT_SELECT }>[]) {
  return rows.map((r) => {
    const requests = new Map<string, { id: string; number: string }>();
    for (const l of r.lines) requests.set(l.order_line.request_line.request.id, l.order_line.request_line.request);

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
      creator: { id: r.creator.id, name: profileName(r.creator) },
      requests: [...requests.values()].sort((a, b) => a.number.localeCompare(b.number)),
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

    const resolvedSorts: ReceiptOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: ReceiptOrderBy[] = [...resolvedSorts, { received_on: 'desc' }, { number: 'desc' }];

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
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} recepciones con los filtros actuales. Acote la exportación con filtros.`,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar recepciones', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en produccion.
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de recepciones. Intente nuevamente.',
    };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getPurchaseReceiptSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): ReceiptWhere {
    const base: FilterState = parsed ?? parseListState({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId as string, { ...base, filters });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
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
      const ids = rows.map((r) => r.supplier_id);
      const suppliers = ids.length
        ? await prisma.suppliers.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.supplier_id, count: r._count }))),
        resolvedOptions: suppliers,
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
      const ids = rows.map((r) => r.created_by);
      const profiles = ids.length
        ? await prisma.profile.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullname: true, email: true },
            orderBy: { fullname: 'asc' },
          })
        : [];
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count }))),
        resolvedOptions: profiles.map((p) => ({ id: p.id, name: profileName(p) })),
      };
    }

    if (columnId === 'requests') {
      // M:M: cuantas recepciones (distintas) tiene cada solicitud de origen
      const receipts = await prisma.purchase_receipts.findMany({
        where,
        select: { lines: { select: { order_line: { select: { request_line: { select: { request: { select: { id: true, number: true } } } } } } } } },
      });
      const counts = new Map<string, number>();
      const names = new Map<string, string>();
      for (const r of receipts) {
        const seen = new Set<string>();
        for (const l of r.lines) {
          const req = l.order_line.request_line.request;
          names.set(req.id, req.number);
          if (!seen.has(req.id)) {
            seen.add(req.id);
            counts.set(req.id, (counts.get(req.id) ?? 0) + 1);
          }
        }
      }
      const resolvedOptions = [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { counts, resolvedOptions };
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
export async function getPurchaseReceiptsAttention(): Promise<{ pendingToReceive: number; canViewOrders: boolean } | null> {
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
