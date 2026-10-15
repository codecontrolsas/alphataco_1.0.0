'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { CACHE_TAGS, CACHE_TTL } from '@/shared/constants/cache';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cacheLife, cacheTag } from 'next/cache';
import { isDeviationAttentionKey, matchesDeviationAttention, type DeviationAggregate } from './deviation-attention';

const logger = new Logger('EquiposConDesvios/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Columnas "ordenables" — combina campos reales de vehicles con las dos
 * columnas calculadas (deviation_count, last_deviation_date). Como el dataset
 * final no sale de un solo findMany de Prisma (ver `buildDataset`), el
 * ordenamiento se resuelve en memoria con `SORT_ACCESSORS`, no con `orderBy`.
 */
const VALID_SORT_FIELDS = new Set([
  'equipment',
  'domain',
  'serie',
  'intern_number',
  'type_of_vehicle',
  'type',
  'sub_type',
  'sector',
  'deviation_count',
  'critical_count',
  'last_deviation_date',
  'first_deviation_date',
]);

const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'equipments_with_deviations';

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Lista blanca de filtros: todo lo demás que venga en la URL se descarta. */
const ALLOWED_FILTERS = new Set([
  'type_of_vehicle',
  'type',
  'sub_type',
  'sector',
  'domain',
  'serie',
  'intern_number',
  // Filtro virtual: lo escriben la banda y las tarjetas de atención (ver `deviation-attention.ts`).
  'attention',
]);

/** Columnas con filtro de texto libre (contains insensitive) sobre vehicles */
const TEXT_FILTER_COLUMNS = ['domain', 'serie', 'intern_number'];

/**
 * Mapping de columnId (URL) → campo real en Prisma.
 * `type_of_vehicle` se maneja manualmente (BigInt requiere conversión explícita).
 */
const COLUMN_MAP: Record<string, string> = {
  type: 'type',
  sub_type: 'subType',
  sector: 'sector',
};

/** Select de vehicles con las relaciones necesarias para las columnas de la tabla */
const EQUIPMENT_SELECT = {
  id: true,
  domain: true,
  serie: true,
  intern_number: true,
  type_of_vehicle: true,
  types_of_vehicles: { select: { id: true, name: true } },
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
} as const;

type EquipmentRow = Prisma.vehiclesGetPayload<{ select: typeof EQUIPMENT_SELECT }>;

/** Item final combinado: datos del vehículo + agregados de desvíos pendientes */
export type EquipmentWithDeviationsListItem = EquipmentRow & {
  deviation_count: number;
  /** Cuántos de los desvíos pendientes son críticos. */
  critical_count: number;
  last_deviation_date: Date | null;
  /** Desvío pendiente más viejo: la antigüedad que dispara la banda de atención. */
  first_deviation_date: Date | null;
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Entrada serializable de la agregación cacheada (ver `getPendingDeviationsAggregateCached`) */
type PendingDeviationAggEntry = {
  equipmentId: string;
  count: number;
  criticalCount: number;
  lastDeviationDateMs: number;
  firstDeviationDateMs: number;
};

/**
 * Reproduce en Prisma la lógica de la vista SQL `equipments_with_pending_deviations`:
 * un desvío está pendiente si NO pertenece a ningún item de solicitud de
 * mantenimiento (`maintenance_request_items`).
 *
 * Se resuelve con un anti-join manual en memoria sobre TODOS los desvíos de la
 * empresa (~1600+ filas) — es el cómputo caro de esta tabla.
 *
 * Cacheada con `'use cache'`: solo puede recibir argumentos serializables (por eso
 * `companyId` como string, sin leer cookies/sesión acá) y solo puede devolver datos
 * serializables (array de objetos planos, sin `Map`/`Date`). El caller reconstruye
 * el `Map` con `Date` reales — ver `getPendingDeviationsAggregateByVehicle`.
 */
async function getPendingDeviationsAggregateCached(companyId: string): Promise<PendingDeviationAggEntry[]> {
  'use cache';
  cacheTag(CACHE_TAGS.TAB_EQUIPMENTS_DEVIATIONS);
  cacheLife({
    expire: CACHE_TTL.EQUIPMENTS_DEVIATIONS_AGGREGATE,
    revalidate: CACHE_TTL.EQUIPMENTS_DEVIATIONS_AGGREGATE,
    stale: 30,
  });

  logger.debug('Calculando agregación de desvíos pendientes por vehículo (cacheable)', { data: { companyId } });

  const deviations = await prisma.checklist_deviations.findMany({
    where: { vehicles: { company_id: companyId } },
    select: {
      id: true,
      equipment_id: true,
      created_at: true,
      is_critical: true,
    },
  });

  if (deviations.length === 0) return [];

  const deviationIds = deviations.map((d) => d.id);

  const requestItems = await prisma.maintenance_request_items.findMany({
    where: { checklist_deviation_id: { in: deviationIds } },
    select: { checklist_deviation_id: true },
  });

  const inRequestSet = new Set(requestItems.map((r) => r.checklist_deviation_id).filter(Boolean));

  const aggregate = new Map<string, DeviationAggregate>();

  for (const d of deviations) {
    if (inRequestSet.has(d.id)) continue;

    const createdAt = d.created_at ?? new Date(0);
    const critical = d.is_critical === true ? 1 : 0;
    const entry = aggregate.get(d.equipment_id);
    if (!entry) {
      aggregate.set(d.equipment_id, {
        count: 1,
        criticalCount: critical,
        lastDeviationDate: createdAt,
        firstDeviationDate: createdAt,
      });
    } else {
      entry.count += 1;
      entry.criticalCount += critical;
      if (createdAt > entry.lastDeviationDate) entry.lastDeviationDate = createdAt;
      if (createdAt < entry.firstDeviationDate) entry.firstDeviationDate = createdAt;
    }
  }

  return [...aggregate.entries()].map(([equipmentId, agg]) => ({
    equipmentId,
    count: agg.count,
    criticalCount: agg.criticalCount,
    lastDeviationDateMs: agg.lastDeviationDate.getTime(),
    firstDeviationDateMs: agg.firstDeviationDate.getTime(),
  }));
}

/**
 * Wrapper NO cacheado: llama a `getPendingDeviationsAggregateCached` (que sí lo está)
 * y reconstruye el `Map<string, { count, lastDeviationDate: Date }>` que consume el
 * resto del módulo (paginado, export y facets).
 */
async function getPendingDeviationsAggregateByVehicle(companyId: string): Promise<Map<string, DeviationAggregate>> {
  const rows = await getPendingDeviationsAggregateCached(companyId);
  const result = new Map<string, DeviationAggregate>();
  for (const row of rows) {
    result.set(row.equipmentId, {
      count: row.count,
      criticalCount: row.criticalCount,
      lastDeviationDate: new Date(row.lastDeviationDateMs),
      firstDeviationDate: new Date(row.firstDeviationDateMs),
    });
  }
  return result;
}

/**
 * Ids de los equipos del agregado que cumplen el filtro virtual `attention` de la URL (todos si no hay).
 * La comparación con "ahora" va AFUERA de la caché: el agregado cacheado no depende del reloj.
 */
function selectEquipmentIds(
  perVehicle: Map<string, DeviationAggregate>,
  state: ReturnType<typeof parseSearchParams>,
  now: Date
): string[] {
  const attention = sanitizeFilters(state, ALLOWED_FILTERS).filters.attention?.[0];
  if (!isDeviationAttentionKey(attention)) return [...perVehicle.keys()];
  return [...perVehicle.entries()]
    .filter(([, agg]) => matchesDeviationAttention(attention, agg, now))
    .map(([id]) => id);
}

/**
 * WHERE sobre `vehicles` — filtros de texto y facetados aplicados a la tabla.
 * Todo dentro de un único `AND` junto con la empresa: ni la búsqueda (un `OR`) ni el `AND` que arma
 * `buildFiltersWhere` al mezclar "Sin asignar" con valores pueden pisar el perímetro.
 */
function buildVehicleWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const filters = sanitizeFilters(state, ALLOWED_FILTERS).filters;
  const searchWhere = buildSearchWhere(state.search, TEXT_FILTER_COLUMNS);

  const { AND: nestedAnd, ...filtersRest } = buildFiltersWhere(filters, COLUMN_MAP, {
    exclude: [...TEXT_FILTER_COLUMNS, 'type_of_vehicle', 'attention'],
  }) as Record<string, unknown> & { AND?: Record<string, unknown>[] };

  const textFiltersWhere = buildTextFiltersWhere(filters, TEXT_FILTER_COLUMNS);

  // type_of_vehicle: FK BigInt NOT NULL — conversión manual (buildFiltersWhere no castea a BigInt)
  const typeOfVehicleFilter: Record<string, unknown> = {};
  const typeOfVehicleValues = filters['type_of_vehicle'];
  if (typeOfVehicleValues?.length) {
    const ids = typeOfVehicleValues
      .map((v) => {
        try {
          return BigInt(v);
        } catch {
          return null;
        }
      })
      .filter((v): v is bigint => v !== null);
    if (ids.length === 1) typeOfVehicleFilter.type_of_vehicle = ids[0];
    else if (ids.length > 1) typeOfVehicleFilter.type_of_vehicle = { in: ids };
  }

  const and: Record<string, unknown>[] = [{ company_id: companyId }];
  for (const piece of [searchWhere, ...(nestedAnd ?? []), filtersRest, textFiltersWhere, typeOfVehicleFilter]) {
    if (Object.keys(piece).length > 0) and.push(piece);
  }
  return { AND: and };
}

const SORT_ACCESSORS: Record<string, (item: EquipmentWithDeviationsListItem) => string | number> = {
  equipment: (i) => i.domain ?? '',
  domain: (i) => i.domain ?? '',
  serie: (i) => i.serie ?? '',
  intern_number: (i) => i.intern_number ?? '',
  type_of_vehicle: (i) => i.types_of_vehicles?.name ?? '',
  type: (i) => i.type_vehicles_typeTotype?.name ?? '',
  sub_type: (i) => i.sub_type?.name ?? '',
  sector: (i) => i.hierarchy?.name ?? '',
  deviation_count: (i) => i.deviation_count,
  critical_count: (i) => i.critical_count,
  last_deviation_date: (i) => i.last_deviation_date?.getTime() ?? 0,
  first_deviation_date: (i) => i.first_deviation_date?.getTime() ?? 0,
};

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'es');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Ordena en memoria según `state.sorting` (multi-sort). Default: más desvíos primero. */
function sortDataset(
  items: EquipmentWithDeviationsListItem[],
  sorting: ReturnType<typeof parseSearchParams>['sorting']
): EquipmentWithDeviationsListItem[] {
  const activeSorts = sorting.filter((s) => VALID_SORT_FIELDS.has(s.id) && SORT_ACCESSORS[s.id]);

  if (activeSorts.length === 0) {
    return [...items].sort((a, b) => compareValues(b.deviation_count, a.deviation_count));
  }

  return [...items].sort((a, b) => {
    for (const s of activeSorts) {
      const accessor = SORT_ACCESSORS[s.id];
      const cmp = compareValues(accessor(a), accessor(b));
      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  });
}

/**
 * Construye el dataset completo (sin paginar) de equipos con desvíos pendientes,
 * aplicando filtros de vehicles y ordenamiento. Compartido entre la query paginada
 * y la de exportación.
 */
async function buildDataset(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const perVehicle = await getPendingDeviationsAggregateByVehicle(companyId);
  const equipmentIds = selectEquipmentIds(perVehicle, state, new Date());
  if (equipmentIds.length === 0) return [];

  const where = buildVehicleWhereClause(companyId, state);

  const vehicles = await prisma.vehicles.findMany({
    where: { AND: [where, { id: { in: equipmentIds } }] },
    select: EQUIPMENT_SELECT,
  });

  const combined: EquipmentWithDeviationsListItem[] = vehicles.map((v) => {
    const agg = perVehicle.get(v.id)!;
    return {
      ...v,
      deviation_count: agg.count,
      critical_count: agg.criticalCount,
      last_deviation_date: agg.lastDeviationDate,
      first_deviation_date: agg.firstDeviationDate,
    };
  });

  return sortDataset(combined, state.sorting);
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getEquipmentsWithDeviationsPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver los equipos con desvíos');
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const dataset = await buildDataset(companyId, state);

    return { data: dataset.slice(skip, skip + take), total: dataset.length };
  } catch (error) {
    logger.error('Error al obtener equipos con desvíos pendientes', { data: { error } });
    throw new Error('No se pudieron obtener los equipos con desvíos pendientes. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

export async function getAllEquipmentsWithDeviationsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentWithDeviationsListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los equipos con desvíos' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const dataset = await buildDataset(companyId, state);

    if (dataset.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación de equipos con desvíos supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: dataset };
  } catch (error) {
    logger.error('Error al exportar equipos con desvíos pendientes', { data: { error } });
    return { ok: false, message: 'No se pudo exportar el listado. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Retorna facets (counts + opciones resueltas) para UNA sola columna FK, con
 * cross-filtering contra los demás filtros activos. Se invoca desde el cliente
 * al abrir el popover de cada filtro.
 */
export async function getEquipmentsWithDeviationsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: { value: string; label: string }[];
} | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  try {
    const companyId = await getActiveCompanyId();
    const perVehicle = await getPendingDeviationsAggregateByVehicle(companyId);

    // Cross-filter: sin el filtro propio de la columna consultada (el de `attention` sí se conserva)
    const state = withoutOwnFilter(parseSearchParams(searchParams || {}), columnId);
    const vehicleIds = selectEquipmentIds(perVehicle, state, new Date());
    if (vehicleIds.length === 0) return { counts: new Map() };
    const where = { AND: [buildVehicleWhereClause(companyId, state), { id: { in: vehicleIds } }] };

    switch (columnId) {
      case 'type_of_vehicle': {
        const rows = await prisma.vehicles.groupBy({ by: ['type_of_vehicle'], where, _count: { _all: true } });
        const counts = toFacetMap(rows.map((r) => ({ key: String(r.type_of_vehicle), count: r._count._all })));
        const ids = rows.map((r) => r.type_of_vehicle).filter((v): v is bigint => v != null);
        const options =
          ids.length > 0
            ? await prisma.types_of_vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: String(o.id), label: o.name ?? '' })) };
      }
      case 'type': {
        const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: { _all: true } });
        const counts = toFacetMap(rows.map((r) => ({ key: r.type, count: r._count._all })));
        const ids = rows.map((r) => r.type).filter(Boolean);
        const options =
          ids.length > 0
            ? await prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sub_type': {
        const rows = await prisma.vehicles.groupBy({ by: ['subType'], where, _count: { _all: true } });
        const counts = toFacetMap(rows.map((r) => ({ key: r.subType, count: r._count._all })));
        const ids = rows.map((r) => r.subType).filter((v): v is string => !!v);
        const options =
          ids.length > 0
            ? await prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      case 'sector': {
        const rows = await prisma.vehicles.groupBy({ by: ['sector'], where, _count: { _all: true } });
        const counts = toFacetMap(rows.map((r) => ({ key: r.sector, count: r._count._all })));
        const ids = rows.map((r) => r.sector).filter((v): v is string => !!v);
        const options =
          ids.length > 0
            ? await prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
        return { counts, resolvedOptions: options.map((o) => ({ value: o.id, label: o.name ?? '' })) };
      }
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet de equipos con desvíos', { data: { error, columnId } });
    return { counts: new Map() };
  }
}

// ============================================================================
// ATENCIÓN — banda y tarjetas
// ============================================================================

/**
 * Equipos cuyo desvío pendiente más viejo lleva más de 30 días sin pedido, del más viejo al más nuevo.
 *
 * Mismo perímetro que la tabla (empresa activa + permiso `view`) y MISMA condición que el filtro `attention=stale`
 * del listado. Devuelve `[]` si no hay permiso o si falla: la banda no se muestra, pero la tabla no se rompe.
 */
export async function getStaleDeviationEquipments() {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return [];

  try {
    const companyId = await getActiveCompanyId();
    const perVehicle = await getPendingDeviationsAggregateByVehicle(companyId);
    const now = new Date();

    const stale = [...perVehicle.entries()]
      .filter(([, agg]) => matchesDeviationAttention('stale', agg, now))
      .sort(([, a], [, b]) => a.firstDeviationDate.getTime() - b.firstDeviationDate.getTime());
    if (stale.length === 0) return [];

    const vehicles = await prisma.vehicles.findMany({
      where: { AND: [{ company_id: companyId }, { id: { in: stale.map(([id]) => id) } }] },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        sub_type: { select: { name: true } },
        type_vehicles_typeTotype: { select: { name: true } },
      },
    });
    const byId = new Map(vehicles.map((v) => [v.id, v]));

    return stale.flatMap(([id, agg]) => {
      const vehicle = byId.get(id);
      if (!vehicle) return [];
      return [
        {
          id,
          domain: vehicle.domain,
          internNumber: vehicle.intern_number,
          typeName: vehicle.sub_type?.name ?? vehicle.type_vehicles_typeTotype?.name ?? null,
          deviationCount: agg.count,
          firstDeviationDate: agg.firstDeviationDate.toISOString(),
        },
      ];
    });
  } catch (error) {
    logger.error('Error al obtener los equipos con desvíos sin pedido hace más de 30 días', { data: { error } });
    return [];
  }
}

/**
 * Métricas de "Equipos con Desvíos". Cada cifra sale del MISMO agregado y de la MISMA condición que la tabla
 * (`selectEquipmentIds` / `matchesDeviationAttention`): al tocar una tarjeta la tabla muestra tantas filas como
 * dice la tarjeta.
 *
 * Nunca lanza: si falla devuelve `null` y la pantalla muestra "—" (jamás un 0 inventado).
 */
export async function getEquipmentsWithDeviationsMetrics() {
  try {
    if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
      logger.warn('Métricas de equipos con desvíos pedidas sin permiso de lectura');
      return null;
    }

    const companyId = await getActiveCompanyId();
    const [perVehicle, staleEquipments] = await Promise.all([
      getPendingDeviationsAggregateByVehicle(companyId),
      getStaleDeviationEquipments(),
    ]);
    const now = new Date();

    let critical = 0;
    let stale = 0;
    for (const agg of perVehicle.values()) {
      if (matchesDeviationAttention('critical', agg, now)) critical += 1;
      if (matchesDeviationAttention('stale', agg, now)) stale += 1;
    }

    return {
      total: perVehicle.size,
      critical,
      stale,
      // Solo los más viejos: la banda nombra uno y avisa cuántos más hay.
      staleSamples: staleEquipments.slice(0, 3),
    };
  } catch (error) {
    logger.error('Error al calcular las métricas de equipos con desvíos', { data: { error } });
    return null;
  }
}
