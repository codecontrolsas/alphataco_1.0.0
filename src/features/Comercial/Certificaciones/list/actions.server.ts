'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { UUID_RE } from '@/features/Purchases/lib/action-errors';
import type { Prisma } from '@/generated/prisma/client';
import { certification_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { toDateOnly } from '@/shared/lib/date-only';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { PENDING_INVOICING_STATUS } from '../lib/attention';

const logger = new Logger('Comercial/Certificaciones/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Columnas ordenables server-side (directas o mapeadas vía SORT_MAP). */
const VALID_SORT_FIELDS = new Set([
  'number',
  'customer',
  'contract',
  'period',
  'status',
  'lines',
  'currency',
  'total',
  'notes',
  'issued_at',
  'confirmed_at',
  'voided_at',
  'voided_reason',
  'created_at',
]);

/** Columnas cuyo orderBy no es `{ [columnId]: dir }`. */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  customer: (dir) => ({ customers: { name: dir } }),
  contract: (dir) => ({ customer_services: { service_name: dir } }),
  period: (dir) => ({ period_from: dir }),
  lines: (dir) => ({ lines: { _count: dir } }),
};

/** columnId → campo de Prisma para los filtros faceteados de valor string. */
const FACETED_COLUMN_MAP: Record<string, string> = {
  customer: 'customer_id',
  contract: 'customer_service_id',
  currency: 'currency',
};

/** Filtros de valor discreto que se validan a mano (enum con lista cerrada). */
const MANUAL_FILTER_COLUMNS = ['status', 'total'];
const TEXT_COLUMNS = ['number', 'notes', 'voided_reason'];
/** Fechas con timestamp: rango sobre la propia columna. */
const DATE_COLUMNS = ['issued_at', 'confirmed_at', 'voided_at', 'created_at'];
/** El período es un rango (desde/hasta) y se compara por superposición, no por una sola columna. */
const PERIOD_COLUMN = 'period';

const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(FACETED_COLUMN_MAP),
  ...MANUAL_FILTER_COLUMNS,
  ...TEXT_COLUMNS,
  ...dateRangeKeys([PERIOD_COLUMN, ...DATE_COLUMNS]),
]);

/** `YYYY-MM-DD`: lo único que se acepta como borde del período. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const IMPOSSIBLE: Prisma.certificationsWhereInput = { id: { in: [] } };

/** Estado de la tabla ya parseado y con solo los filtros permitidos. */
function parseListState(searchParams: DataTableSearchParams) {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

type TableState = ReturnType<typeof parseListState>;

// ============================================================================
// WHERE
// ============================================================================

/**
 * WHERE compartido entre la query paginada, el export y las facetas. Todo cuelga de un único `AND`
 * con el perímetro de empresa primero: ningún filtro puede pisarlo.
 */
function buildWhereClause(
  companyId: string,
  canViewPrices: boolean,
  state: TableState
): Prisma.certificationsWhereInput {
  const and: Prisma.certificationsWhereInput[] = [{ company_id: companyId }];

  // Búsqueda global: número, cliente, contrato o número de contrato
  const search = state.search.trim();
  if (search) {
    and.push({
      OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { customers: { name: { contains: search, mode: 'insensitive' } } },
        { customer_services: { service_name: { contains: search, mode: 'insensitive' } } },
        { customer_services: { contract_number: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  // Estado: lista cerrada. Un valor que no es del enum no filtra por "lo que quedó": no devuelve nada.
  const statusValues = state.filters.status;
  if (statusValues?.length) {
    const valid = statusValues.filter((v): v is certification_status =>
      (Object.values(certification_status) as string[]).includes(v)
    );
    and.push(valid.length ? { status: { in: valid } } : IMPOSSIBLE);
  }

  // FK UUID: un id mal formado haría fallar la consulta entera
  const filtersWhere = buildFiltersWhere(sanitizeUuidFilters(state.filters), FACETED_COLUMN_MAP, {
    exclude: [...MANUAL_FILTER_COLUMNS, ...TEXT_COLUMNS, ...dateRangeKeys([PERIOD_COLUMN, ...DATE_COLUMNS])],
  });
  and.push(filtersWhere as Prisma.certificationsWhereInput);

  and.push(buildTextFiltersWhere(state.filters, TEXT_COLUMNS) as Prisma.certificationsWhereInput);
  and.push(buildDateRangeFiltersWhere(state.filters, DATE_COLUMNS) as Prisma.certificationsWhereInput);

  // Período: se muestran las certificaciones cuyo rango SE SUPERPONE con el pedido
  const from = state.filters[`${PERIOD_COLUMN}_from`]?.[0];
  const to = state.filters[`${PERIOD_COLUMN}_to`]?.[0];
  if (from) {
    and.push(DATE_ONLY_RE.test(from) ? { period_to: { gte: new Date(`${from}T00:00:00.000Z`) } } : IMPOSSIBLE);
  }
  if (to) {
    and.push(DATE_ONLY_RE.test(to) ? { period_from: { lte: new Date(`${to}T00:00:00.000Z`) } } : IMPOSSIBLE);
  }

  // Total: solo con view_prices (si no, ni se filtra ni se ordena por lo que no se puede ver); importe exacto
  const totalFilter = state.filters.total?.[0];
  if (canViewPrices && totalFilter) {
    const normalized = totalFilter.trim().replace(',', '.');
    and.push(/^\d+(\.\d{1,2})?$/.test(normalized) ? { total: normalized } : IMPOSSIBLE);
  }

  return { AND: and };
}

/** Los filtros de FK UUID con un id inválido se descartan por completo (el resultado sale vacío). */
function sanitizeUuidFilters(filters: Record<string, string[]>): Record<string, string[]> {
  const result = { ...filters };
  for (const key of ['customer', 'contract']) {
    const values = result[key];
    if (values?.length) result[key] = values.filter((v) => UUID_RE.test(v));
    // Todos inválidos: que no se quite el filtro, que no encuentre nada
    if (values?.length && result[key].length === 0) result[key] = ['00000000-0000-0000-0000-000000000000'];
  }
  return result;
}

/** Multi-sort del usuario (solo campos válidos) y, de fondo, el orden por período y número. */
function buildOrderBy(state: TableState, canViewPrices: boolean): Prisma.certificationsOrderByWithRelationInput[] {
  const resolved: Record<string, unknown>[] = [];
  for (const s of state.sorting) {
    if (!VALID_SORT_FIELDS.has(s.id)) continue;
    if (s.id === 'total' && !canViewPrices) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const mapper = SORT_MAP[s.id];
    resolved.push(mapper ? mapper(dir) : { [s.id]: dir });
  }
  return [
    ...resolved,
    { period_to: 'desc' },
    { number: 'desc' },
    { id: 'asc' },
  ] as Prisma.certificationsOrderByWithRelationInput[];
}

// ============================================================================
// SELECT / MAPPING
// ============================================================================

const CERTIFICATION_SELECT = {
  id: true,
  number: true,
  status: true,
  period_from: true,
  period_to: true,
  currency: true,
  total: true,
  notes: true,
  issued_at: true,
  confirmed_at: true,
  voided_at: true,
  voided_reason: true,
  created_at: true,
  customers: { select: { id: true, name: true } },
  customer_services: { select: { id: true, service_name: true, contract_number: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.certificationsSelect;

type CertificationDbRow = Prisma.certificationsGetPayload<{ select: typeof CERTIFICATION_SELECT }>;

/** Serializa para el cliente: fechas `YYYY-MM-DD`, timestamps ISO e importe como texto (nunca Number). */
function mapCertification(row: CertificationDbRow, canViewPrices: boolean) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    periodFrom: toDateOnly(row.period_from) ?? '',
    periodTo: toDateOnly(row.period_to) ?? '',
    currency: row.currency,
    total: canViewPrices ? row.total.toString() : null,
    notes: row.notes,
    issuedAt: row.issued_at?.toISOString() ?? null,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    voidedAt: row.voided_at?.toISOString() ?? null,
    voidedReason: row.voided_reason,
    createdAt: row.created_at.toISOString(),
    customer: { id: row.customers.id, name: row.customers.name },
    contract: {
      id: row.customer_services.id,
      name: row.customer_services.service_name,
      number: row.customer_services.contract_number,
    },
    linesCount: row._count.lines,
  };
}

async function loadContext() {
  const companyId = await getActiveCompanyId();
  const [canView, canViewPrices] = await Promise.all([
    checkPermissionServer('comercial', 'certificaciones', 'view'),
    checkPermissionServer('comercial', 'certificaciones', 'view_prices'),
  ]);
  if (!canView) throw new Error('No tenés permiso para ver las certificaciones.');
  return { companyId, canViewPrices };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getCertificationsPaginated(searchParams: DataTableSearchParams) {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, canViewPrices, state);

    const [rows, total] = await Promise.all([
      prisma.certifications.findMany({
        skip,
        take,
        where,
        orderBy: buildOrderBy(state, canViewPrices),
        select: CERTIFICATION_SELECT,
      }),
      prisma.certifications.count({ where }),
    ]);

    return { data: rows.map((r) => mapCertification(r, canViewPrices)), total };
  } catch (error) {
    logger.error('Error al obtener certificaciones paginadas', { data: { error } });
    throw new Error('No se pudieron obtener las certificaciones. Intente nuevamente.');
  }
}

export type CertificationListItem = Awaited<ReturnType<typeof getCertificationsPaginated>>['data'][number];

// ============================================================================
// EXPORT (sin paginación, por tandas y con tope)
// ============================================================================

export async function getCertificationsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<CertificationListItem[]>> {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, canViewPrices, state);
    const orderBy = buildOrderBy(state, canViewPrices);

    const rows = await fetchExportRowsInBatches({
      listIds: (take) => prisma.certifications.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.certifications.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: CERTIFICATION_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} certificaciones con los filtros actuales. Acote la exportación con filtros.`,
    });

    return { ok: true, data: rows.map((r) => mapCertification(r, canViewPrices)) };
  } catch (error) {
    logger.error('Error al exportar certificaciones', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en producción.
    const message =
      error instanceof ExportTooLargeError
        ? error.message
        : 'No se pudo exportar el listado de certificaciones. Intente nuevamente.';
    return { ok: false, message };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

function contractLabel(row: {
  service_name: string | null;
  contract_number: string | null;
  customers: { name: string } | null;
}) {
  return [row.customers?.name, row.service_name ?? 'Sin nombre', row.contract_number && `N° ${row.contract_number}`]
    .filter(Boolean)
    .join(' · ');
}

export async function getCertificationSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  try {
    const { companyId, canViewPrices } = await loadContext();
    const baseState = parseListState(searchParams ?? {});
    // Cross-filter: todos los filtros activos EXCEPTO el de la propia columna
    const where = buildWhereClause(companyId, canViewPrices, withoutOwnFilter(baseState, columnId));

    switch (columnId) {
      case 'status': {
        const rows = await prisma.certifications.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
      }
      case 'currency': {
        const rows = await prisma.certifications.groupBy({ by: ['currency'], where, _count: true });
        return {
          counts: toFacetMap(rows.map((r) => ({ key: r.currency, count: r._count }))),
          resolvedOptions: rows
            .map((r) => ({ id: r.currency, name: r.currency }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        };
      }
      case 'customer': {
        const rows = await prisma.certifications.groupBy({ by: ['customer_id'], where, _count: true });
        const ids = rows.map((r) => r.customer_id);
        const options = ids.length
          ? await prisma.customers.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
        return {
          counts: toFacetMap(rows.map((r) => ({ key: r.customer_id, count: r._count }))),
          resolvedOptions: options,
        };
      }
      case 'contract': {
        const rows = await prisma.certifications.groupBy({ by: ['customer_service_id'], where, _count: true });
        const ids = rows.map((r) => r.customer_service_id);
        const options = ids.length
          ? await prisma.customer_services.findMany({
              where: { id: { in: ids }, customers: { company_id: companyId } },
              select: { id: true, service_name: true, contract_number: true, customers: { select: { name: true } } },
            })
          : [];
        return {
          counts: toFacetMap(rows.map((r) => ({ key: r.customer_service_id, count: r._count }))),
          resolvedOptions: options
            .map((o) => ({ id: o.id, name: contractLabel(o) }))
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        };
      }
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facetas de certificaciones', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCIÓN: confirmadas sin facturar
// ============================================================================

/**
 * Certificaciones confirmadas que todavía no se facturaron. Usa el mismo estado (`PENDING_INVOICING_STATUS`)
 * y el mismo perímetro que el listado, así el número de la banda es el total de la tabla filtrada por
 * "Confirmada". Nunca rechaza: devuelve `null` si no se pudo contar (la banda simplemente no se muestra).
 */
export async function getCertificationAttention(): Promise<{ pendingInvoicing: number } | null> {
  try {
    const { companyId } = await loadContext();
    const pendingInvoicing = await prisma.certifications.count({
      where: { AND: [{ company_id: companyId }, { status: PENDING_INVOICING_STATUS }] },
    });
    return { pendingInvoicing };
  } catch (error) {
    logger.error('Error al contar certificaciones sin facturar', { data: { error } });
    return null;
  }
}
