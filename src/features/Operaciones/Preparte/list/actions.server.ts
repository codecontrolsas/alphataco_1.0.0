'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('Preparte/list/actions.server');

const IGNORED_PARAMS = new Set(['tab', 'subtab', 'inactive_subtab']);
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
  ...DATE_RANGE_COLUMNS.flatMap((column) => [`${column}_from`, `${column}_to`]),
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

export interface PreparteFacetOption {
  id: string;
  name: string;
}

function sanitizeState(state: ReturnType<typeof parseSearchParams>) {
  for (const key of Object.keys(state.filters)) {
    if (IGNORED_PARAMS.has(key) || !ALLOWED_FILTER_PARAMS.has(key)) {
      delete state.filters[key];
    }
  }
  return state;
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
      case 'order':
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
    const { skip, take } = stateToPrismaParams(state);
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

export async function getAllPrepartesForExport(searchParams: DataTableSearchParams): Promise<PreparteListItem[]> {
  const companyId = await getActiveCompanyId();

  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const rows = await prisma.preparte.findMany({
      where: buildWhereClause(companyId, state),
      orderBy: buildOrderBy(state),
      select: PREPARTE_SELECT,
    });

    return rows.map(serializePreparte);
  } catch (error) {
    logger.error('Error al exportar pedidos', { data: { error } });
    throw new Error('No se pudo exportar la lista de pedidos. Intente nuevamente.');
  }
}

function toFacetMap(rows: Array<{ key: string | null | undefined; count: number }>): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const key = row.key ?? NULL_FILTER_VALUE;
    result.set(key, (result.get(key) ?? 0) + row.count);
  }
  return result;
}

function withNullFacetOption(
  options: PreparteFacetOption[],
  counts: Map<string, number>,
  nullLabel = 'Sin asignar'
): PreparteFacetOption[] {
  return counts.has(NULL_FILTER_VALUE)
    ? [...options, { id: NULL_FILTER_VALUE, name: nullLabel }]
    : options;
}

function hasCredentialId(profile: { credential_id: string | null; fullname: string | null }): profile is {
  credential_id: string;
  fullname: string | null;
} {
  return typeof profile.credential_id === 'string' && profile.credential_id.length > 0;
}

export async function getPreparteFacets(searchParams?: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();

  try {
    const parsedState = searchParams ? sanitizeState(parseSearchParams(searchParams)) : null;
    const baseWhere = buildCompanyScope(companyId);

    const crossWhere = (excludeColumn: string): Prisma.preparteWhereInput => {
      if (!parsedState) return baseWhere;
      const modifiedState = {
        ...parsedState,
        filters: { ...parsedState.filters },
      };
      delete modifiedState.filters[excludeColumn];
      delete modifiedState.filters[`${excludeColumn}_from`];
      delete modifiedState.filters[`${excludeColumn}_to`];
      return buildWhereClause(companyId, modifiedState);
    };

    const [
      statusRows,
      customerRows,
      serviceRows,
      sectorRows,
      areaRows,
      equipmentRows,
      itemRows,
      typeRows,
      shiftRows,
      rejectedByRows,
      cancelledByRows,
      reprogrammedByRows,
    ] = await Promise.all([
      prisma.preparte.groupBy({ by: ['status'], where: crossWhere('status'), _count: true }),
      prisma.preparte.groupBy({ by: ['cliente_id'], where: crossWhere('customer'), _count: true }),
      prisma.preparte.groupBy({ by: ['contrato_id'], where: crossWhere('service'), _count: true }),
      prisma.preparte.groupBy({ by: ['sector_service_id'], where: crossWhere('sector'), _count: true }),
      prisma.preparte.groupBy({ by: ['areas_service_id'], where: crossWhere('area'), _count: true }),
      prisma.preparte.groupBy({ by: ['equipos_cliente'], where: crossWhere('customerEquipment'), _count: true }),
      prisma.preparte.groupBy({ by: ['item'], where: crossWhere('serviceItem'), _count: true }),
      prisma.preparte.groupBy({ by: ['tipo'], where: crossWhere('tipo'), _count: true }),
      prisma.preparte.groupBy({ by: ['jornada'], where: crossWhere('jornada'), _count: true }),
      prisma.preparte.groupBy({ by: ['rejected_by'], where: crossWhere('rejectedBy'), _count: true }),
      prisma.preparte.groupBy({ by: ['cancelled_by'], where: crossWhere('cancelledBy'), _count: true }),
      prisma.preparte.groupBy({ by: ['reprogrammed_by'], where: crossWhere('reprogrammedBy'), _count: true }),
    ]);

    const customerIds = customerRows.map((row) => row.cliente_id);
    const serviceIds = serviceRows.map((row) => row.contrato_id);
    const sectorIds = sectorRows.flatMap((row) => (row.sector_service_id ? [row.sector_service_id] : []));
    const areaIds = areaRows.flatMap((row) => (row.areas_service_id ? [row.areas_service_id] : []));
    const equipmentIds = equipmentRows.flatMap((row) => (row.equipos_cliente ? [row.equipos_cliente] : []));
    const itemIds = itemRows.flatMap((row) => (row.item ? [row.item] : []));
    const rejectedActorIds = rejectedByRows.flatMap((row) => (row.rejected_by ? [row.rejected_by] : []));
    const cancelledActorIds = cancelledByRows.flatMap((row) => (row.cancelled_by ? [row.cancelled_by] : []));
    const reprogrammedActorIds = reprogrammedByRows.flatMap((row) =>
      row.reprogrammed_by ? [row.reprogrammed_by] : []
    );

    const [
      customers,
      services,
      sectors,
      areas,
      equipment,
      items,
      rejectedActors,
      cancelledActors,
      reprogrammedActors,
    ] = await Promise.all([
      prisma.customers.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.customer_services.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, service_name: true },
        orderBy: { service_name: 'asc' },
      }),
      prisma.service_sectors.findMany({
        where: { id: { in: sectorIds } },
        select: { id: true, sectors: { select: { name: true } } },
      }),
      prisma.service_areas.findMany({
        where: { id: { in: areaIds } },
        select: { id: true, areas_cliente: { select: { nombre: true } } },
      }),
      prisma.equipos_clientes.findMany({
        where: { id: { in: equipmentIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.service_items.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, item_name: true },
        orderBy: { item_name: 'asc' },
      }),
      prisma.profile.findMany({
        where: { credential_id: { in: rejectedActorIds } },
        select: { credential_id: true, fullname: true },
        orderBy: { fullname: 'asc' },
      }),
      prisma.profile.findMany({
        where: { credential_id: { in: cancelledActorIds } },
        select: { credential_id: true, fullname: true },
        orderBy: { fullname: 'asc' },
      }),
      prisma.profile.findMany({
        where: { credential_id: { in: reprogrammedActorIds } },
        select: { credential_id: true, fullname: true },
        orderBy: { fullname: 'asc' },
      }),
    ]);

    const status = toFacetMap(statusRows.map((row) => ({ key: row.status, count: row._count })));
    const customer = toFacetMap(customerRows.map((row) => ({ key: row.cliente_id, count: row._count })));
    const service = toFacetMap(serviceRows.map((row) => ({ key: row.contrato_id, count: row._count })));
    const sector = toFacetMap(sectorRows.map((row) => ({ key: row.sector_service_id, count: row._count })));
    const area = toFacetMap(areaRows.map((row) => ({ key: row.areas_service_id, count: row._count })));
    const customerEquipment = toFacetMap(
      equipmentRows.map((row) => ({ key: row.equipos_cliente, count: row._count }))
    );
    const serviceItem = toFacetMap(itemRows.map((row) => ({ key: row.item, count: row._count })));
    const rejectedBy = toFacetMap(rejectedByRows.map((row) => ({ key: row.rejected_by, count: row._count })));
    const cancelledBy = toFacetMap(cancelledByRows.map((row) => ({ key: row.cancelled_by, count: row._count })));
    const reprogrammedBy = toFacetMap(
      reprogrammedByRows.map((row) => ({ key: row.reprogrammed_by, count: row._count }))
    );

    return {
      status,
      customer,
      customerOptions: customers.map((row) => ({ id: row.id, name: row.name || 'Cliente sin nombre' })),
      service,
      serviceOptions: services.map((row) => ({ id: row.id, name: row.service_name || 'Contrato sin nombre' })),
      sector,
      sectorOptions: withNullFacetOption(
        sectors.map((row) => ({ id: row.id, name: row.sectors?.name || 'Sector sin nombre' })),
        sector,
        'Sin sector'
      ),
      area,
      areaOptions: withNullFacetOption(
        areas.map((row) => ({ id: row.id, name: row.areas_cliente?.nombre || 'Área sin nombre' })),
        area,
        'Sin área'
      ),
      customerEquipment,
      customerEquipmentOptions: withNullFacetOption(
        equipment.map((row) => ({ id: row.id, name: row.name || 'Equipo sin nombre' })),
        customerEquipment,
        'Sin equipo'
      ),
      serviceItem,
      serviceItemOptions: withNullFacetOption(
        items.map((row) => ({ id: row.id, name: row.item_name || 'Ítem sin nombre' })),
        serviceItem,
        'Sin ítem'
      ),
      tipo: toFacetMap(typeRows.map((row) => ({ key: row.tipo, count: row._count }))),
      jornada: toFacetMap(shiftRows.map((row) => ({ key: row.jornada, count: row._count }))),
      rejectedBy,
      rejectedByOptions: withNullFacetOption(
        rejectedActors.filter(hasCredentialId).map((row) => ({
          id: row.credential_id,
          name: row.fullname || 'Usuario sin nombre',
        })),
        rejectedBy
      ),
      cancelledBy,
      cancelledByOptions: withNullFacetOption(
        cancelledActors.filter(hasCredentialId).map((row) => ({
          id: row.credential_id,
          name: row.fullname || 'Usuario sin nombre',
        })),
        cancelledBy
      ),
      reprogrammedBy,
      reprogrammedByOptions: withNullFacetOption(
        reprogrammedActors.filter(hasCredentialId).map((row) => ({
          id: row.credential_id,
          name: row.fullname || 'Usuario sin nombre',
        })),
        reprogrammedBy
      ),
    };
  } catch (error) {
    logger.error('Error al obtener facetas de pedidos', { data: { error } });
    return null;
  }
}

export type PreparteFacets = Awaited<ReturnType<typeof getPreparteFacets>>;
