import 'server-only';

import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap } from '@/shared/lib/table-facets';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { cacheLife, cacheTag } from 'next/cache';
import { MAINTENANCE_ORDERS_SELECT } from './order-select';
import { buildOrdersWhere, getOrdersWithCurrentSector } from './order-where';

const logger = new Logger('MaintenanceOrders/table/order-queries');

/** Campos reales de maintenance_orders ordenables server-side */
const VALID_SORT_FIELDS = new Set(['order_number', 'workshop_entry_date', 'created_at', 'status', 'vehicle']);

/** Mapeo de columnId → orderBy de Prisma para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle: (dir) => ({ vehicles: { domain: dir } }),
};

export type FacetPayload = {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
};

/**
 * Cacheadas con `'use cache'`: NO pueden leer cookies/sesión, así que reciben la empresa y los tipos
 * ocultos ya resueltos (entran en la clave del cache: un usuario nunca ve el cache de otra empresa
 * ni de otro con distintos tipos ocultos — ticket 690).
 */
export async function getOrdersPaginatedCached(
  companyId: string,
  hiddenTypeIds: readonly string[],
  searchParams: DataTableSearchParams
) {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_IN_WORKSHOP, CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ expire: CACHE_TTL.PAGINATED_LIST, revalidate: CACHE_TTL.PAGINATED_LIST, stale: 30 });

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const where = await buildOrdersWhere(state, { companyId, hiddenTypeIds });

    const [data, total] = await Promise.all([
      prisma.maintenance_orders.findMany({ where, skip, take, orderBy: safeOrderBy, select: MAINTENANCE_ORDERS_SELECT }),
      prisma.maintenance_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener órdenes de mantenimiento paginadas', { data: { error } });
    throw error;
  }
}

/**
 * Opciones y counts de UN filtro facetado (lazy-load) con cross-filter: el WHERE excluye el filtro propio.
 */
export async function getOrdersSingleFacetCached(
  companyId: string,
  hiddenTypeIds: readonly string[],
  columnId: string,
  searchParams: DataTableSearchParams
): Promise<FacetPayload | null> {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_IN_WORKSHOP, CACHE_TAGS.MAINTENANCE_ORDERS);
  cacheLife({ expire: CACHE_TTL.FACETS, revalidate: CACHE_TTL.FACETS, stale: 30 });

  try {
    const state = parseSearchParams(searchParams);
    const ctx = { companyId, hiddenTypeIds };

    switch (columnId) {
      // Se incluyen las completadas: "Completada" sigue siendo opción filtrable con su contador (ticket 595).
      case 'status': {
        const where = await buildOrdersWhere(state, ctx, { excludeColumn: 'status', includeCompleted: true });
        const rows = await prisma.maintenance_orders.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
      }

      case 'vehicle': {
        const where = await buildOrdersWhere(state, ctx, { excludeColumn: 'vehicle' });
        const rows = await prisma.maintenance_orders.groupBy({
          by: ['equipment_id', 'other_equipment_id'],
          where,
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.equipment_id ?? r.other_equipment_id, count: r._count })));

        const vehicleIds = rows.flatMap((r) => (r.equipment_id ? [r.equipment_id] : []));
        const equipmentIds = rows.flatMap((r) => (r.other_equipment_id ? [r.other_equipment_id] : []));
        const [vehicles, equipment] = await Promise.all([
          vehicleIds.length > 0
            ? prisma.vehicles.findMany({
                where: { id: { in: vehicleIds }, company_id: companyId },
                select: { id: true, domain: true, serie: true, intern_number: true },
              })
            : [],
          equipmentIds.length > 0
            ? prisma.other_equipment.findMany({
                where: { id: { in: equipmentIds }, company_id: companyId },
                select: { id: true, serial_number: true, intern_number: true },
              })
            : [],
        ]);
        const withIntern = (label: string, intern: string | null) => (intern ? `${label} #${intern}` : label);
        const resolvedOptions = [
          ...vehicles.map((v) => ({
            id: v.id,
            name: withIntern(v.domain ?? v.serie ?? 'Sin identificar', v.intern_number),
          })),
          ...equipment.map((e) => ({
            id: e.id,
            name: withIntern(e.serial_number ?? e.intern_number ?? 'Sin identificar', e.serial_number ? e.intern_number : null),
          })),
        ].sort((a, b) => a.name.localeCompare(b.name));

        return { counts, resolvedOptions };
      }

      // Sector actual (ticket 675): se calcula por orden sobre las que cumplen el resto de filtros.
      case 'currentSector': {
        const where = await buildOrdersWhere(state, ctx, { excludeColumn: 'currentSector' });
        const orders = await getOrdersWithCurrentSector(where);

        const counts = new Map<string, number>();
        const nameById = new Map<string, string>();
        for (const o of orders) {
          const key = o.sector?.id ?? NULL_FILTER_VALUE;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (o.sector) nameById.set(o.sector.id, o.sector.name);
        }
        const resolvedOptions = Array.from(nameById.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return { counts, resolvedOptions };
      }

      default:
        logger.warn('Faceta desconocida', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet de órdenes de mantenimiento', { data: { error, columnId } });
    return { counts: new Map<string, number>() };
  }
}
