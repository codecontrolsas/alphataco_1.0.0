'use server';

import { Logger } from '@/lib/logger';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { sanitizeFilters, dateRangeKeys } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';
import { getSupervisorFilterInfo } from '../../utils/supervisorFilter';

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

/**
 * Memoiza getSupervisorFilterInfo dentro del mismo request del servidor.
 * NO se exporta — solo se usa internamente en este módulo. Evita que
 * getMaintenanceRequestsPaginated / getAllMaintenanceRequestsForExport /
 * getMaintenanceRequestSingleFacet repitan las 2 queries de permisos cada una
 * cuando se resuelven en el mismo request (ej: SSR inicial de la página).
 */
const getCachedSupervisorFilterInfo = cache(getSupervisorFilterInfo);

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

const OTHER_EQUIPMENT_SELECT = {
  id: true,
  intern_number: true,
  serial_number: true,
  type: { select: { name: true } },
} as const;

/**
 * Construye el where base. Todo va dentro de un único AND con la empresa y el estado fijos primero:
 * ningún filtro de la URL puede pisar la empresa ni el estado.
 * Recibe filterInfo pre-cargado para evitar múltiples llamadas a getSupervisorFilterInfo.
 */
function buildWhereClause(
  companyId: string,
  rawState: ReturnType<typeof parseSearchParams>,
  filterInfo: Awaited<ReturnType<typeof getSupervisorFilterInfo>>,
  hiddenTypeIds: readonly string[]
) {
  const state = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);

  // Filtros facetados
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_COLUMNS, ...DATE_COLUMNS, 'fileNumber'],
  });

  // Filtros de texto (kilometer, engine_hours — "contains" insensitive)
  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_COLUMNS);

  // Filtros de rango de fechas
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_COLUMNS, {
    created_at: 'created_at',
  });

  // Búsqueda global: dominio / interno del equipo, nombre y legajo del chofer
  const search = state.search?.trim();
  const searchCondition = search
    ? {
        OR: [
          { vehicles: { domain: { contains: search, mode: 'insensitive' as const } } },
          { vehicles: { intern_number: { contains: search, mode: 'insensitive' as const } } },
          { driver_employee: { lastname: { contains: search, mode: 'insensitive' as const } } },
          { driver_employee: { firstname: { contains: search, mode: 'insensitive' as const } } },
          { driver_employee: { file: { contains: search, mode: 'insensitive' as const } } },
          { employees: { lastname: { contains: search, mode: 'insensitive' as const } } },
          { employees: { firstname: { contains: search, mode: 'insensitive' as const } } },
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

  // Tipos de equipamiento ocultos para el usuario actual (ticket 690).
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);

  const conditions: Record<string, unknown>[] = [
    { company_id: companyId },
    // Solo solicitudes pendientes de aprobación (paso "Validar Solicitud").
    // Las rechazadas se limpian de este listado: quedan como registro histórico
    // en el legajo del equipo, tab "Historial de Mantenimiento".
    { status: 'pending_approval' },
    filtersWhere,
    textFiltersWhere,
    dateFiltersWhere,
  ];
  if (searchCondition) conditions.push(searchCondition);
  if (fileNumberCondition) conditions.push(fileNumberCondition);
  if (equipmentCondition) conditions.push(equipmentCondition);

  // Sin perfil resuelto no se puede saber si ve todo: no ve nada (antes quedaba sin restricción).
  if (!filterInfo) conditions.push({ id: { in: [] } });
  else if (filterInfo.shouldFilterBySupervisor) conditions.push({ supervisor_id: filterInfo.userId });

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

    const [filterInfo, hiddenTypeIds] = await Promise.all([
      getCachedSupervisorFilterInfo(),
      getHiddenEquipmentTypeIds(),
    ]);
    const where = buildWhereClause(companyId, state, filterInfo, hiddenTypeIds);

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
        select: {
          id: true,
          status: true,
          created_at: true,
          source: true,
          preventive_type: true,
          kilometer: true,
          engine_hours: true,
          supervisor_id: true,
          rejection_reason: true,
          vehicles: { select: VEHICLE_SELECT },
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
        },
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
    const [filterInfo, hiddenTypeIds] = await Promise.all([
      getCachedSupervisorFilterInfo(),
      getHiddenEquipmentTypeIds(),
    ]);
    const where = buildWhereClause(companyId, state, filterInfo, hiddenTypeIds);

    const data = await prisma.maintenance_requests.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true,
        status: true,
        created_at: true,
        source: true,
        preventive_type: true,
        kilometer: true,
        engine_hours: true,
        rejection_reason: true,
        supervisor_id: true,
        vehicles: { select: VEHICLE_SELECT },
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
      },
    });

    if (data.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
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
    const [filterInfo, hiddenTypeIds] = await Promise.all([
      getCachedSupervisorFilterInfo(),
      getHiddenEquipmentTypeIds(),
    ]);

    function crossWhere(excludeColumn: string) {
      return buildWhereClause(companyId, withoutOwnFilter(state, excludeColumn), filterInfo, hiddenTypeIds);
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
