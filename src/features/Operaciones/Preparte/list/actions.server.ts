'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';

const logger = new Logger('Preparte/list/actions.server');

const DATE_RANGE_COLUMNS = ['requestDate', 'executionDate', 'created_at'];
const TEXT_COLUMNS = [
  'numero_pedido',
  'start_time',
  'end_time',
  'solicitante',
  'confirmed_by',
  'observaciones',
];

const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  customer: 'cliente_id',
  service: 'contrato_id',
  sector: 'sector_service_id',
  area: 'areas_service_id',
  customerEquipment: 'equipos_cliente',
  serviceItem: 'item',
  tipo: 'tipo',
  jornada: 'jornada',
  rejectedBy: 'rejected_by',
  cancelledBy: 'cancelled_by',
  reprogrammedBy: 'reprogrammed_by',
};

const ALLOWED_FILTER_PARAMS = new Set([
  ...Object.keys(COLUMN_MAP),
  ...TEXT_COLUMNS,
  'quantity',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

const PREPARTE_SELECT = {
  id: true,
  cliente_id: true,
  contrato_id: true,
  tipo: true,
  jornada: true,
  start_time: true,
  end_time: true,
  solicitante: true,
  item: true,
  observaciones: true,
  executionDate: true,
  created_at: true,
  updated_at: true,
  quantity: true,
  requestDate: true,
  cancel_reason: true,
  numero_pedido: true,
  rejected_reason: true,
  reprogram: true,
  reprogram_reason: true,
  company_id: true,
  sector_service_id: true,
  areas_service_id: true,
  equipos_cliente: true,
  status: true,
  preparteImage: true,
  confirmed_by: true,
  rejected_by: true,
  cancelled_by: true,
  reprogrammed_by: true,
  subject_to_availability: true,
  customers: { select: { id: true, name: true } },
  customer_services: { select: { id: true, service_name: true } },
  service_sectors: { select: { id: true, sectors: { select: { id: true, name: true } } } },
  service_areas: { select: { id: true, areas_cliente: { select: { id: true, nombre: true } } } },
  equipos_clientes: { select: { id: true, name: true } },
  service_items: { select: { id: true, item_name: true } },
  rejected_by_profile: { select: { credential_id: true, fullname: true } },
  cancelled_by_profile: { select: { credential_id: true, fullname: true } },
  reprogrammed_by_profile: { select: { credential_id: true, fullname: true } },
} as const;

type PreparteQueryItem = Prisma.preparteGetPayload<{ select: typeof PREPARTE_SELECT }>;

export type PreparteListItem = Omit<
  PreparteQueryItem,
  'quantity' | 'requestDate' | 'executionDate' | 'created_at' | 'updated_at'
> & {
  quantity: number | null;
  requestDate: string | null;
  executionDate: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Descarta del estado todo filtro que no sea una columna de la tabla (`tab`, `subtab`, `company_id`…): la
 * paginada, el export y las facetas arman su `where` SIEMPRE desde este estado.
 */
function sanitizeState(state: ReturnType<typeof parseSearchParams>) {
  return sanitizeFilters(state, ALLOWED_FILTER_PARAMS);
}

function buildCompanyScope(companyId: string): Prisma.preparteWhereInput {
  return {
    OR: [{ company_id: companyId }, { company_id: null }],
  };
}

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>): Prisma.preparteWhereInput {
  const searchWhere = buildSearchWhere(state.search, [
    'numero_pedido',
    'solicitante',
    'observaciones',
    'cancel_reason',
    'rejected_reason',
    'reprogram_reason',
    'confirmed_by',
  ]);

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_COLUMNS,
      'quantity',
      ...DATE_RANGE_COLUMNS,
      ...DATE_RANGE_COLUMNS.flatMap((column) => [`${column}_from`, `${column}_to`]),
    ],
  });
  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const manualFilters: Prisma.preparteWhereInput = {};
  const quantityValue = state.filters.quantity?.[0];
  if (quantityValue) {
    const quantity = Number(quantityValue);
    if (Number.isFinite(quantity)) manualFilters.quantity = quantity;
  }

  return {
    AND: [
      buildCompanyScope(companyId),
      searchWhere as Prisma.preparteWhereInput,
      filtersWhere as Prisma.preparteWhereInput,
      textFiltersWhere as Prisma.preparteWhereInput,
      dateFiltersWhere as Prisma.preparteWhereInput,
      manualFilters,
    ],
  };
}

function buildOrderBy(state: ReturnType<typeof parseSearchParams>): Prisma.preparteOrderByWithRelationInput[] {
  const orderBy: Prisma.preparteOrderByWithRelationInput[] = [];

  for (const sort of state.sorting) {
    const direction: Prisma.SortOrder = sort.desc ? 'desc' : 'asc';
    switch (sort.id) {
      case 'requestDate':
      case 'executionDate':
      case 'numero_pedido':
      case 'status':
      case 'quantity':
      case 'tipo':
      case 'jornada':
      case 'start_time':
      case 'end_time':
      case 'solicitante':
      case 'confirmed_by':
      case 'observaciones':
      case 'created_at':
        orderBy.push({ [sort.id]: direction });
        break;
      case 'customer':
        orderBy.push({ customers: { name: direction } });
        break;
      case 'service':
        orderBy.push({ customer_services: { service_name: direction } });
        break;
      case 'customerEquipment':
        orderBy.push({ equipos_clientes: { name: direction } });
        break;
      case 'serviceItem':
        orderBy.push({ service_items: { item_name: direction } });
        break;
      case 'sector':
        orderBy.push({ service_sectors: { sectors: { name: direction } } });
        break;
      case 'area':
        orderBy.push({ service_areas: { areas_cliente: { nombre: direction } } });
        break;
      case 'rejectedBy':
        orderBy.push({ rejected_by_profile: { fullname: direction } });
        break;
      case 'cancelledBy':
        orderBy.push({ cancelled_by_profile: { fullname: direction } });
        break;
      case 'reprogrammedBy':
        orderBy.push({ reprogrammed_by_profile: { fullname: direction } });
        break;
    }
  }

  return orderBy.length > 0 ? orderBy : [{ requestDate: 'desc' }, { created_at: 'desc' }];
}

function serializePreparte(item: PreparteQueryItem): PreparteListItem {
  return {
    ...item,
    quantity: item.quantity == null ? null : Number(item.quantity),
    requestDate: item.requestDate?.toISOString() ?? null,
    executionDate: item.executionDate?.toISOString() ?? null,
    created_at: item.created_at?.toISOString() ?? null,
    updated_at: item.updated_at?.toISOString() ?? null,
  };
}

export async function getPrepartesPaginated(
  searchParams: DataTableSearchParams
): Promise<{ data: PreparteListItem[]; total: number }> {
  const companyId = await getActiveCompanyId();

  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, state);
    const orderBy = buildOrderBy(state);

    const [rows, total] = await Promise.all([
      prisma.preparte.findMany({ skip, take, where, orderBy, select: PREPARTE_SELECT }),
      prisma.preparte.count({ where }),
    ]);

    return { data: rows.map(serializePreparte), total };
  } catch (error) {
    logger.error('Error al obtener pedidos paginados', { data: { error } });
    throw new Error('No se pudo obtener la lista de pedidos. Intente nuevamente.');
  }
}

export async function getAllPrepartesForExport(searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = buildWhereClause(companyId, state);
    const orderBy = [...buildOrderBy(state), { id: 'asc' as const }];

    // Por tandas y con tope (EXPORT_MAX_ROWS): no se materializa la tabla entera de una sola vez.
    const rows = await fetchExportRowsInBatches({
      listIds: (take) => prisma.preparte.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) => prisma.preparte.findMany({ where: { id: { in: ids } }, select: PREPARTE_SELECT }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} pedidos con los filtros actuales. Acote la exportación con filtros.`,
    });

    const data: PreparteListItem[] = rows.map(serializePreparte);
    return { ok: true, data } satisfies ExportResult<PreparteListItem[]>;
  } catch (error) {
    logger.error('Error al exportar pedidos', { data: { error } });
    // Resultado discriminado: Next enmascara el mensaje de un error lanzado desde una server action en producción.
    const message =
      error instanceof ExportTooLargeError
        ? error.message
        : 'No se pudo exportar la lista de pedidos. Intente nuevamente.';
    return { ok: false, message } satisfies ExportResult<never>;
  }
}

/** Opción ya resuelta de una faceta (valor del filtro + etiqueta visible). */
export interface PreparteFacetOption {
  value: string;
  label: string;
}

/** Resultado de la faceta de UNA columna: conteos por valor y, para FK, las opciones resueltas. */
export interface PreparteSingleFacet {
  counts: Map<string, number>;
  resolvedOptions?: PreparteFacetOption[];
}

/** Nombres de usuarios (perfiles) por `credential_id`, ordenados alfabéticamente. */
async function resolveActorOptions(credentialIds: string[]): Promise<PreparteFacetOption[]> {
  if (credentialIds.length === 0) return [];
  const profiles = await prisma.profile.findMany({
    where: { credential_id: { in: credentialIds } },
    select: { credential_id: true, fullname: true },
    orderBy: { fullname: 'asc' },
  });
  return profiles.flatMap((profile) =>
    profile.credential_id
      ? [{ value: profile.credential_id, label: profile.fullname || 'Usuario sin nombre' }]
      : []
  );
}

/** Ids no nulos de una columna agrupada. */
function nonNull(values: Array<string | null>): string[] {
  return values.flatMap((value) => (value ? [value] : []));
}

/**
 * Faceta de UNA columna (lazy-load: se pide al abrir el filtro). Los conteos excluyen el filtro propio de
 * la columna (cross-filter). Para columnas FK devuelve además las opciones resueltas (solo los valores
 * presentes en el conjunto filtrado). Devuelve `null` si la columna no tiene faceta o la consulta falla.
 */
export async function getPreparteSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams
): Promise<PreparteSingleFacet | null> {
  const companyId = await getActiveCompanyId();

  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'status': {
        const rows = await prisma.preparte.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.status, count: row._count }))) };
      }
      case 'tipo': {
        const rows = await prisma.preparte.groupBy({ by: ['tipo'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.tipo, count: row._count }))) };
      }
      case 'jornada': {
        const rows = await prisma.preparte.groupBy({ by: ['jornada'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.jornada, count: row._count }))) };
      }
      case 'customer': {
        const rows = await prisma.preparte.groupBy({ by: ['cliente_id'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.cliente_id, count: row._count })));
        const customers = await prisma.customers.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.cliente_id)) } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts,
          resolvedOptions: customers.map((row) => ({ value: row.id, label: row.name || 'Cliente sin nombre' })),
        };
      }
      case 'service': {
        const rows = await prisma.preparte.groupBy({ by: ['contrato_id'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.contrato_id, count: row._count })));
        const services = await prisma.customer_services.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.contrato_id)) } },
          select: { id: true, service_name: true },
          orderBy: { service_name: 'asc' },
        });
        return {
          counts,
          resolvedOptions: services.map((row) => ({ value: row.id, label: row.service_name || 'Contrato sin nombre' })),
        };
      }
      case 'sector': {
        const rows = await prisma.preparte.groupBy({ by: ['sector_service_id'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.sector_service_id, count: row._count })));
        const sectors = await prisma.service_sectors.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.sector_service_id)) } },
          select: { id: true, sectors: { select: { name: true } } },
        });
        return {
          counts,
          resolvedOptions: sectors.map((row) => ({ value: row.id, label: row.sectors?.name || 'Sector sin nombre' })),
        };
      }
      case 'area': {
        const rows = await prisma.preparte.groupBy({ by: ['areas_service_id'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.areas_service_id, count: row._count })));
        const areas = await prisma.service_areas.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.areas_service_id)) } },
          select: { id: true, areas_cliente: { select: { nombre: true } } },
        });
        return {
          counts,
          resolvedOptions: areas.map((row) => ({ value: row.id, label: row.areas_cliente?.nombre || 'Área sin nombre' })),
        };
      }
      case 'customerEquipment': {
        const rows = await prisma.preparte.groupBy({ by: ['equipos_cliente'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.equipos_cliente, count: row._count })));
        const equipment = await prisma.equipos_clientes.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.equipos_cliente)) } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts,
          resolvedOptions: equipment.map((row) => ({ value: row.id, label: row.name || 'Equipo sin nombre' })),
        };
      }
      case 'serviceItem': {
        const rows = await prisma.preparte.groupBy({ by: ['item'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.item, count: row._count })));
        const items = await prisma.service_items.findMany({
          where: { id: { in: nonNull(rows.map((row) => row.item)) } },
          select: { id: true, item_name: true },
          orderBy: { item_name: 'asc' },
        });
        return {
          counts,
          resolvedOptions: items.map((row) => ({ value: row.id, label: row.item_name || 'Ítem sin nombre' })),
        };
      }
      case 'rejectedBy': {
        const rows = await prisma.preparte.groupBy({ by: ['rejected_by'], where, _count: true });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.rejected_by, count: row._count }))),
          resolvedOptions: await resolveActorOptions(nonNull(rows.map((row) => row.rejected_by))),
        };
      }
      case 'cancelledBy': {
        const rows = await prisma.preparte.groupBy({ by: ['cancelled_by'], where, _count: true });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.cancelled_by, count: row._count }))),
          resolvedOptions: await resolveActorOptions(nonNull(rows.map((row) => row.cancelled_by))),
        };
      }
      case 'reprogrammedBy': {
        const rows = await prisma.preparte.groupBy({ by: ['reprogrammed_by'], where, _count: true });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.reprogrammed_by, count: row._count }))),
          resolvedOptions: await resolveActorOptions(nonNull(rows.map((row) => row.reprogrammed_by))),
        };
      }
      default:
        logger.warn('columnId no soportado en getPreparteSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de pedidos', { data: { error, columnId } });
    return null;
  }
}
