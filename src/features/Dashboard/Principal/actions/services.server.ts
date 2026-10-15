'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { REMIT_NUMBERS_SELECT, remitNumberContainsWhere } from '@/features/Operaciones/PartesDiarios/remitManager/lib/remit-numbers';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { buildTodayReportWhere } from '../lib/dashboard-dates';
import { groupServicesByClient, summarizeServicesByType } from '../lib/indicators';
import { toFacetMap } from '../lib/row-mapping';
import type { ServiceDetailByClient, ServicesSummaryResult } from './types';

const logger = new Logger('features/Dashboard/Principal/services');

/**
 * Servicios del parte diario: resumen por tipo, detalle por cliente y la tabla paginada
 * del diálogo. Todo acotado a la empresa activa (`getActiveCompanyId()`).
 */

/** Resumen de servicios por tipo de operación para el día de hoy. */
export async function getServicesSummary(): Promise<ServicesSummaryResult[]> {
  logger.debug('Obteniendo resumen de servicios por tipo');

  try {
    const companyId = await getActiveCompanyId();

    const grouped = await prisma.dailyreportrows.groupBy({
      by: ['type_service'],
      where: { status: { in: ['pendiente', 'ejecutado'] }, ...buildTodayReportWhere(companyId) },
      _count: { id: true },
    });

    return summarizeServicesByType(grouped);
  } catch (error) {
    logger.error('Error al obtener resumen de servicios', { data: { error } });
    return [];
  }
}

/** Detalle de servicios por cliente para una fecha (por defecto, hoy). */
export async function getServicesDetailByClient(date?: string): Promise<ServiceDetailByClient[]> {
  logger.debug('Obteniendo detalle de servicios por cliente', { data: { date } });

  try {
    const companyId = await getActiveCompanyId();

    const rows = await prisma.dailyreportrows.findMany({
      where: {
        customer_id: { not: null },
        status: { in: ['pendiente', 'ejecutado'] },
        ...buildTodayReportWhere(companyId, date),
      },
      select: {
        type_service: true,
        status: true,
        customers: { select: { id: true, name: true } },
      },
    });

    return groupServicesByClient(rows);
  } catch (error) {
    logger.error('Error al obtener detalle de servicios por cliente', { data: { error } });
    return [];
  }
}

export type ServicesDetailByClientData = Awaited<ReturnType<typeof getServicesDetailByClient>>;

// ─────────────────────────────────────────────────────────────────────────────
// Detalle de servicios — DataTable server-side
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SORT_FIELDS = new Set(['status', 'type_service', 'created_at', 'description']);
const TEXT_COLUMNS = ['description'];
const DATE_COLUMNS = ['created_at'];

const SERVICES_DETAIL_SELECT = {
  id: true,
  status: true,
  type_service: true,
  description: true,
  remitos: REMIT_NUMBERS_SELECT,
  created_at: true,
  customers: { select: { id: true, name: true } },
} as const;

/** WHERE compartido entre la query paginada, la exportación y las facetas. */
function buildServicesDetailWhere(companyId: string, targetDate: string, state: ReturnType<typeof parseSearchParams>) {
  const filtersWhere = buildFiltersWhere(
    state.filters,
    { customer: 'customer_id' },
    {
      exclude: [
        ...TEXT_COLUMNS,
        'remit_number',
        ...DATE_COLUMNS.flatMap((column) => [`${column}_from`, `${column}_to`]),
      ],
    }
  );

  // Los remitos viven en la tabla `remitos` (1:N): búsqueda y filtro con `some`
  const search = buildSearchWhere(state.search, ['description']);
  const remitFilter = state.filters['remit_number']?.[0];

  // Búsqueda y filtro de remito van en el AND, para no pisar (ni ser pisados por) los OR/AND de los filtros
  const extraConditions: Prisma.dailyreportrowsWhereInput[] = [
    ...(state.search ? [{ OR: [...(search.OR ?? []), remitNumberContainsWhere(state.search)] }] : []),
    ...(remitFilter ? [remitNumberContainsWhere(remitFilter)] : []),
  ];
  const filtersAnd = (filtersWhere as { AND?: Prisma.dailyreportrowsWhereInput[] }).AND ?? [];

  return {
    customer_id: { not: null },
    ...buildTodayReportWhere(companyId, targetDate),
    ...filtersWhere,
    ...buildTextFiltersWhere(state.filters, TEXT_COLUMNS),
    ...buildDateRangeFiltersWhere(state.filters, DATE_COLUMNS),
    ...(extraConditions.length > 0 ? { AND: [...filtersAnd, ...extraConditions] } : {}),
  };
}

/** Detalle de servicios paginado para el DataTable del diálogo. */
export async function getServicesDetailPaginated(searchParams: DataTableSearchParams, targetDate: string) {
  logger.debug('Obteniendo servicios detalle paginados', { data: { targetDate } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildServicesDetailWhere(companyId, targetDate, state);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const sort of state.sorting) {
      if (!VALID_SORT_FIELDS.has(sort.id)) continue;
      const dir: 'asc' | 'desc' = sort.desc ? 'desc' : 'asc';
      resolvedSorts.push(sort.id === 'customer' ? { customers: { name: dir } } : { [sort.id]: dir });
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }];

    const [data, total] = await Promise.all([
      prisma.dailyreportrows.findMany({ skip, take, orderBy: safeOrderBy, where, select: SERVICES_DETAIL_SELECT }),
      prisma.dailyreportrows.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener servicios detalle paginados', { data: { error } });
    throw new Error(`Error al obtener servicios: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type ServicesDetailListItem = Awaited<ReturnType<typeof getServicesDetailPaginated>>['data'][number];

/** Todos los servicios detalle sin paginar, para la exportación a Excel. */
export async function getAllServicesDetailForExport(searchParams: DataTableSearchParams, targetDate: string) {
  logger.debug('Exportando servicios detalle', { data: { targetDate } });

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);

    return await prisma.dailyreportrows.findMany({
      orderBy: [{ created_at: 'desc' as const }],
      where: buildServicesDetailWhere(companyId, targetDate, state),
      select: SERVICES_DETAIL_SELECT,
    });
  } catch (error) {
    logger.error('Error al exportar servicios detalle', { data: { error } });
    throw new Error('Error al exportar servicios');
  }
}

/** Facetas por columna con cross-filter para el DataTable de servicios detalle. */
export async function getServicesDetailSingleFacet(
  columnId: string,
  targetDate: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  logger.debug('Obteniendo facet de servicios detalle', { data: { columnId, targetDate } });

  try {
    const companyId = await getActiveCompanyId();
    const parsedState = parseSearchParams(searchParams && Object.keys(searchParams).length > 0 ? searchParams : {});

    function crossWhere(excludeColumn: string) {
      const modified = { ...parsedState, filters: { ...parsedState.filters } };
      delete modified.filters[excludeColumn];
      delete modified.filters[`${excludeColumn}_from`];
      delete modified.filters[`${excludeColumn}_to`];
      return buildServicesDetailWhere(companyId, targetDate, modified);
    }

    switch (columnId) {
      case 'status': {
        const groups = await prisma.dailyreportrows.groupBy({
          by: ['status'],
          where: crossWhere('status'),
          _count: { id: true },
        });
        return { counts: toFacetMap(groups.map((group) => ({ key: group.status, count: group._count.id }))) };
      }

      case 'type_service': {
        const groups = await prisma.dailyreportrows.groupBy({
          by: ['type_service'],
          where: crossWhere('type_service'),
          _count: { id: true },
        });
        return { counts: toFacetMap(groups.map((group) => ({ key: group.type_service, count: group._count.id }))) };
      }

      case 'customer': {
        const groups = await prisma.dailyreportrows.groupBy({
          by: ['customer_id'],
          where: crossWhere('customer'),
          _count: { id: true },
        });
        const ids = groups.map((group) => group.customer_id).filter((id): id is string => id != null);
        const resolvedOptions =
          ids.length > 0
            ? await prisma.customers.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];
        return {
          counts: toFacetMap(groups.map((group) => ({ key: group.customer_id, count: group._count.id }))),
          resolvedOptions,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet de servicios detalle', { data: { error, columnId } });
    return null;
  }
}
