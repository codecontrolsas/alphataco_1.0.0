'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { type DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportRowLimitMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isRequestAttentionKey, requestAttentionCondition } from './request-attention';
import { requestScopeConditions, resolveRequestListScope, type RequestListScope } from './request-scope';

const logger = new Logger('SolicitudesMantenimiento/actionsTableServer');

// Permiso de lectura de la tab "Solicitudes de Mantenimiento" (mapa de permisos: mantenimiento > maintenance_requests).
const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'maintenance_requests';

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

async function assertCanViewRequests() {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver las solicitudes de mantenimiento');
  }
}

// Columnas de texto filtrable (usan "contains" insensitive)
const TEXT_COLUMNS = ['kilometer', 'engine_hours'];

// Columnas de fecha
const DATE_COLUMNS = ['created_at'];

// Mapa de columnas a campos de Prisma para filtros
// La clave es el columnId del DataTable, el valor es el campo real en Prisma
const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  vehicle: 'equipment_id', // columnId 'vehicle' → campo DB 'equipment_id'
  source: 'source',
  supervisor: 'supervisor_id', // columnId 'supervisor' → campo DB 'supervisor_id'
};

// Claves de filtro aceptadas desde la URL (lista blanca): el resto se descarta antes de armar el where.
const ALLOWED_FILTER_KEYS = new Set<string>([
  ...Object.keys(COLUMN_MAP),
  ...TEXT_COLUMNS,
  ...dateRangeKeys(DATE_COLUMNS),
  'fileNumber',
  // Filtro virtual: lo escriben la banda y las métricas de atención (ver `request-attention.ts`).
  'attention',
]);

// Campos válidos para ordenamiento (deben existir en el modelo Prisma)
const VALID_SORT_FIELDS = new Set(['created_at', 'status', 'source', 'updated_at', 'kilometer', 'engine_hours']);

// Mapeo de columnas FK/derivadas a orderBy de Prisma con relación
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle: (dir) => ({ vehicles: { domain: dir } }),
  // Cascada de 3 fuentes (driver_employee FK → JSON legacy → employees FK vieja): no hay un
  // orderBy de Prisma que la cubra entera. Se ordena por la fuente canónica hacia adelante
  // (driver_employee, ya que los registros nuevos siempre la traen poblada), igual que ya
  // se hace con `vehicle` sobre `vehicles.domain`. Los registros legacy (sin driver_employee_id)
  // quedan agrupados por el null, comportamiento documentado en la auditoría del ticket 673.
  driver: (dir) => ({ driver_employee: { lastname: dir } }),
  fileNumber: (dir) => ({ driver_employee: { file: dir } }),
  supervisor: (dir) => ({ profile_maintenance_requests_supervisor_idToprofile: { fullname: dir } }),
  items_count: (dir) => ({ maintenance_request_items: { _count: dir } }),
};

// Select del vehículo/equipamiento asociado a la solicitud (excluyentes: equipment_id XOR other_equipment_id)
const VEHICLE_SELECT = {
  id: true,
  domain: true,
  serie: true,
  intern_number: true,
} as const;

// Para la celda "Equipo" de la tabla: suma el tipo (subtítulo de la patente).
const VEHICLE_LIST_SELECT = {
  ...VEHICLE_SELECT,
  type_vehicles_typeTotype: { select: { name: true } },
} as const;

const OTHER_EQUIPMENT_SELECT = {
  id: true,
  intern_number: true,
  serial_number: true,
  type: { select: { name: true } },
  sub_type: { select: { name: true } },
} as const;

/**
 * Columnas que lee la tabla (y su export). Una sola definición para que el listado y el export no diverjan.
 * `checklist_deviations.is_critical` alimenta "N crítico(s)" de la celda Desvíos; el legajo del supervisor
 * sale de su empleado vinculado (`profile.employees`).
 */
const REQUEST_LIST_SELECT = {
  id: true,
  status: true,
  created_at: true,
  source: true,
  preventive_type: true,
  kilometer: true,
  engine_hours: true,
  supervisor_id: true,
  rejection_reason: true,
  vehicles: { select: VEHICLE_LIST_SELECT },
  other_equipment: { select: OTHER_EQUIPMENT_SELECT },
  employees: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      file: true,
    },
  },
  driver_employee: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      file: true,
    },
  },
  profile_maintenance_requests_supervisor_idToprofile: {
    select: {
      id: true,
      fullname: true,
      employees: { select: { file: true } },
    },
  },
  checklist_answers: {
    select: {
      id: true,
      answer_data: true,
    },
  },
  maintenance_request_items: {
    select: {
      id: true,
      status: true,
      checklist_deviations: { select: { is_critical: true } },
    },
  },
  maintenance_orders: {
    select: {
      id: true,
      status: true,
      scheduled_date: true,
    },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
} as const;

/**
 * Construye el where base. Todo va dentro de un único AND con el perímetro (empresa, estado fijo, tipos
 * ocultos, supervisor) primero: ningún filtro de la URL puede pisar la empresa ni el estado.
 * Recibe el perímetro ya resuelto para no repetir las consultas de permisos en cada función.
 * El perímetro y la condición de `attention` son los MISMOS que usan las métricas y el contador del pipeline.
 */
function buildWhereClause(rawState: ReturnType<typeof parseSearchParams>, scope: RequestListScope) {
  const state = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);

  // Filtros facetados
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_COLUMNS, ...DATE_COLUMNS, 'fileNumber', 'attention'],
  });

  // Filtros de texto (kilometer, engine_hours — "contains" insensitive)
  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_COLUMNS);

  // Filtros de rango de fechas
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_COLUMNS, {
    created_at: 'created_at',
  });

  // Búsqueda global: dominio / serie / N° interno del equipo (vehículo o equipamiento, ticket 596),
  // nombre y legajo del chofer. Va dentro del AND: es un OR y no puede pisar al perímetro.
  const search = state.search?.trim();
  const contains = search ? { contains: search, mode: 'insensitive' as const } : null;
  const searchCondition = contains
    ? {
        OR: [
          { vehicles: { OR: [{ domain: contains }, { serie: contains }, { intern_number: contains }] } },
          { other_equipment: { OR: [{ serial_number: contains }, { intern_number: contains }] } },
          { other_equipment: { type: { name: contains } } },
          { other_equipment: { sub_type: { name: contains } } },
          { driver_employee: { lastname: contains } },
          { driver_employee: { firstname: contains } },
          { driver_employee: { file: contains } },
          { employees: { lastname: contains } },
          { employees: { firstname: contains } },
        ],
      }
    : null;

  // Legajo del chofer — coincidencia EXACTA (no "contains"), busca en las dos fuentes de FK
  // posibles (driver_employee nuevo, employees viejo). El chofer legacy vía JSON no tiene
  // legajo asociado y no es filtrable por este campo.
  const fileNumberValue = state.filters.fileNumber?.[0];
  const fileNumberCondition = fileNumberValue
    ? { OR: [{ driver_employee: { file: fileNumberValue } }, { employees: { file: fileNumberValue } }] }
    : null;

  // Filtro virtual de atención (banda y métricas): una sola clave válida, el resto se descarta.
  const attentionValue = state.filters.attention?.[0];
  const attentionCondition = isRequestAttentionKey(attentionValue) ? requestAttentionCondition(attentionValue) : null;

  const conditions: Record<string, unknown>[] = [
    ...requestScopeConditions(scope),
    filtersWhere,
    textFiltersWhere,
    dateFiltersWhere,
  ];
  if (searchCondition) conditions.push(searchCondition);
  if (fileNumberCondition) conditions.push(fileNumberCondition);
  if (attentionCondition) conditions.push(attentionCondition);

  return { AND: conditions };
}

/**
 * Obtiene solicitudes de mantenimiento paginadas para el DataTable.
 * Incluye información de maintenance_orders para mostrar el estado del pedido.
 */
export async function getMaintenanceRequestsPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Obteniendo solicitudes de mantenimiento paginadas', { data: { searchParams } });

  await assertCanViewRequests();
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);

    const scope = await resolveRequestListScope(companyId);
    const where = buildWhereClause(state, scope);

    // Resolver ordenamiento con validación y soporte de FK/relaciones derivadas
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) {
        resolvedSorts.push(fkMapper(dir));
      } else if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: dir });
      }
    }
    const orderBy = resolvedSorts.length > 0 ? resolvedSorts : [{ created_at: 'desc' as const }];

    const [data, total] = await Promise.all([
      prisma.maintenance_requests.findMany({
        where,
        skip,
        take,
        orderBy,
        select: REQUEST_LIST_SELECT,
      }),
      prisma.maintenance_requests.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener solicitudes de mantenimiento paginadas', { data: { error } });
    throw new Error('Error al obtener las solicitudes de mantenimiento');
  }
}

export type MaintenanceRequestListData = Awaited<ReturnType<typeof getMaintenanceRequestsPaginated>>['data'];
export type MaintenanceRequestListItem = MaintenanceRequestListData[number];

/**
 * Obtiene todas las solicitudes de mantenimiento para exportar a Excel (sin paginación).
 */
export async function getAllMaintenanceRequestsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<MaintenanceRequestListData>> {
  logger.debug('Exportando solicitudes de mantenimiento');

  await assertCanViewRequests();
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const scope = await resolveRequestListScope(companyId);
    const where = buildWhereClause(state, scope);

    const data = await prisma.maintenance_requests.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      select: REQUEST_LIST_SELECT,
    });

    if (data.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: exportRowLimitMessage(EXPORT_MAX_ROWS),
      };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar solicitudes de mantenimiento', { data: { error } });
    return { ok: false, message: 'No se pudo exportar las solicitudes de mantenimiento' };
  }
}

/**
 * Obtiene el facet (opciones + counts) de UNA sola columna, bajo demanda (lazy-load).
 * Implementa cross-filtering: excluye el filtro propio de la columna consultada.
 */
export async function getMaintenanceRequestSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  logger.debug('Obteniendo facet individual de solicitudes de mantenimiento', { data: { columnId } });

  await assertCanViewRequests();
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams || {});
    const scope = await resolveRequestListScope(companyId);

    function crossWhere(excludeColumn: string) {
      return buildWhereClause(withoutOwnFilter(state, excludeColumn), scope);
    }

    const where = crossWhere(columnId);

    switch (columnId) {
      case 'status': {
        const rows = await prisma.maintenance_requests.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
        });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count.status }))) };
      }

      case 'source': {
        const rows = await prisma.maintenance_requests.groupBy({
          by: ['source'],
          where,
          _count: { source: true },
        });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.source, count: r._count.source }))) };
      }

      case 'vehicle': {
        const rows = await prisma.maintenance_requests.groupBy({
          by: ['equipment_id'],
          where,
          _count: { equipment_id: true },
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.equipment_id, count: r._count.equipment_id })));
        const ids = rows.map((r) => r.equipment_id).filter((id): id is string => Boolean(id));
        const vehicles =
          ids.length > 0
            ? await prisma.vehicles.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: VEHICLE_SELECT,
              })
            : [];
        const resolvedOptions = vehicles.map((v) => ({
          id: v.id,
          name: v.intern_number
            ? `${v.domain || v.serie || 'Sin identificar'} (#${v.intern_number})`
            : v.domain || v.serie || 'Sin identificar',
        }));
        return { counts, resolvedOptions };
      }

      case 'supervisor': {
        const rows = await prisma.maintenance_requests.groupBy({
          by: ['supervisor_id'],
          where,
          _count: { supervisor_id: true },
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.supervisor_id, count: r._count.supervisor_id })));
        const ids = rows.map((r) => r.supervisor_id).filter((id): id is string => Boolean(id));
        const profiles =
          ids.length > 0
            ? await prisma.profile.findMany({
                where: { id: { in: ids } },
                select: { id: true, fullname: true },
              })
            : [];
        return { counts, resolvedOptions: profiles.map((p) => ({ id: p.id, name: p.fullname })) };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet individual de solicitudes de mantenimiento', {
      data: { error, columnId },
    });
    return { counts: new Map<string, number>() };
  }
}
