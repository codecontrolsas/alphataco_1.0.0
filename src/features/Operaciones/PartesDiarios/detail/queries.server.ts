'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams, NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { runFacet, toFacetMap, withoutOwnFilter, type FacetConfig } from '@/shared/lib/table-facets';
import { employeeLabel } from '@/shared/lib/resource-labels';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { buildRowSelect, buildWhereClause, FK_SORT_MAP, VALID_SORT_FIELDS } from './lib/row-query';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/queries');

// ============================================================================
// 1. HEADER QUERY
// ============================================================================

/**
 * Obtiene la cabecera del parte diario (id, date, status).
 * Usado por el componente de encabezado de la página de detalle.
 */
export async function getDailyReportHeader(dailyReportId: string) {
  logger.debug('Obteniendo cabecera del parte diario', { data: { dailyReportId } });

  try {
    // Perímetro: el parte tiene que ser de la empresa activa.
    const companyId = await getActiveCompanyId();

    const data = await prisma.dailyreport.findFirst({
      where: { id: dailyReportId, company_id: companyId },
      select: {
        id: true,
        date: true,
        status: true,
        is_active: true,
        creation_date: true,
      },
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener cabecera del parte diario', { data: { error, dailyReportId } });
    throw new Error('No se pudo obtener la cabecera del parte diario. Intente nuevamente.');
  }
}

// ============================================================================
// 2. PAGINATED QUERY
// ============================================================================

/**
 * Obtiene las filas del parte diario con paginación, filtros y ordenamiento.
 * Reemplaza las 4 queries Supabase + RPC del sistema anterior en una sola llamada Prisma.
 *
 * @param dailyReportId - ID del parte diario
 * @param searchParams - Parámetros de búsqueda/filtro/paginación del DataTable
 * @param _reportDate - DEPRECADO: ya no se usa (el diagrama del día dejó de traerse); se mantiene por compatibilidad
 */
export async function getDailyReportDetailPaginated(
  dailyReportId: string,
  searchParams: DataTableSearchParams,
  _reportDate?: string
) {
  logger.debug('Obteniendo filas del parte diario paginadas', {
    data: { dailyReportId, searchParams },
  });

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(dailyReportId, state, companyId);

    // Multi-sort con soporte para FK
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

    // Orden por defecto: cliente, servicio, ítem
    const safeOrderBy =
      resolvedSorts.length > 0
        ? resolvedSorts
        : [
            { customers: { name: 'asc' as const } },
            { customer_services: { service_name: 'asc' as const } },
            { service_items: { item_name: 'asc' as const } },
          ];

    const rowSelect = buildRowSelect();

    const [data, total] = await Promise.all([
      prisma.dailyreportrows.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: rowSelect,
      }),
      prisma.dailyreportrows.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener filas del parte diario paginadas', {
      data: { error, dailyReportId },
    });
    throw new Error('No se pudieron obtener las filas del parte diario. Intente nuevamente.');
  }
}

// ============================================================================
// 4. SINGLE FACET (lazy-load con cross-filter)
// ============================================================================

type FacetWhere = ReturnType<typeof buildWhereClause>;

/** Facetas de una sola columna, resueltas por el motor genérico `runFacet` (`Operaciones/lib/facets`). */
const FACET_CONFIG: Record<string, FacetConfig<FacetWhere>> = {
  // ── Enums, texto y booleanos directos ─────────────────────────────────────
  status: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['status'], where, _count: true })).map((r) => ({
        key: r.status,
        count: r._count,
      })),
  },
  type_service: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['type_service'], where, _count: true })).map((r) => ({
        key: r.type_service,
        count: r._count,
      })),
  },
  working_day: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['working_day'], where, _count: true })).map((r) => ({
        key: r.working_day,
        count: r._count,
      })),
  },
  completed_day: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['completed_day'], where, _count: true })).map((r) => ({
        key: r.completed_day,
        count: r._count,
      })),
  },
  completed_night: {
    kind: 'direct',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['completed_night'], where, _count: true })).map((r) => ({
        key: r.completed_night,
        count: r._count,
      })),
  },

  // ── FK con lookup de nombre ───────────────────────────────────────────────
  customer: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['customer_id'], where, _count: true })).map((r) => ({
        key: r.customer_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.customers.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((c) => [c.id, { value: c.id, label: c.name }]));
    },
  },
  service: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['service_id'], where, _count: true })).map((r) => ({
        key: r.service_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.customer_services.findMany({
        where: { id: { in: ids } },
        select: { id: true, service_name: true },
      });
      return new Map(rows.map((s) => [s.id, { value: s.id, label: s.service_name ?? s.id }]));
    },
  },
  item: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['item_id'], where, _count: true })).map((r) => ({
        key: r.item_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.service_items.findMany({
        where: { id: { in: ids } },
        select: { id: true, item_name: true },
      });
      return new Map(rows.map((i) => [i.id, { value: i.id, label: i.item_name ?? i.id }]));
    },
  },
  // sector_service_id → service_sectors → sectors
  sector: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['sector_service_id'], where, _count: true })).map((r) => ({
        key: r.sector_service_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.service_sectors.findMany({
        where: { id: { in: ids } },
        select: { id: true, sectors: { select: { id: true, name: true } } },
      });
      return new Map(
        rows.flatMap((ss) => (ss.sectors ? [[ss.id, { value: ss.sectors.id, label: ss.sectors.name ?? ss.sectors.id }] as const] : []))
      );
    },
  },
  // areas_service_id → service_areas → areas_cliente
  area: {
    kind: 'lookup',
    group: async (where) =>
      (await prisma.dailyreportrows.groupBy({ by: ['areas_service_id'], where, _count: true })).map((r) => ({
        key: r.areas_service_id,
        count: r._count,
      })),
    lookup: async (ids) => {
      const rows = await prisma.service_areas.findMany({
        where: { id: { in: ids } },
        select: { id: true, areas_cliente: { select: { id: true, descripcion_corta: true } } },
      });
      return new Map(
        rows.flatMap((sa) =>
          sa.areas_cliente
            ? [[sa.id, { value: sa.areas_cliente.id, label: sa.areas_cliente.descripcion_corta ?? sa.areas_cliente.id }] as const]
            : []
        )
      );
    },
  },
};

/**
 * Retorna counts + opciones resueltas para UNA columna del filtro faceteado.
 * Implementa cross-filtering: excluye el filtro propio para mostrar
 * cuántos registros tendría cada opción si se cambiara solo ese filtro.
 *
 * Columnas soportadas: status, type_service, working_day, completed_day, completed_night,
 * customer, service, item, sector, area (tabla `FACET_CONFIG`) y employees, equipment,
 * customer_equipment (M:M, a mano).
 */
export async function getDailyReportDetailSingleFacet(
  dailyReportId: string,
  columnId: string,
  searchParams?: DataTableSearchParams
) {
  logger.debug('Obteniendo facet del parte diario', { data: { dailyReportId, columnId } });

  // Perímetro: el parte tiene que ser de la empresa activa.
  const companyId = await getActiveCompanyId();

  // WHERE con todos los filtros EXCEPTO el de la columna indicada
  function crossWhere(excludeColumn: string) {
    const state = withoutOwnFilter(parseSearchParams(searchParams ?? {}), excludeColumn);
    return buildWhereClause(dailyReportId, state, companyId);
  }

  try {
    const config = FACET_CONFIG[columnId];
    if (config) {
      return await runFacet(config, crossWhere(columnId));
    }

    switch (columnId) {
      // ── M:M → employees ──────────────────────────────────────────────────
      case 'employees': {
        const where = crossWhere('employees');
        const [rows, rowsWithoutEmployees] = await Promise.all([
          prisma.dailyreportemployeerelations.groupBy({
            by: ['employee_id'],
            where: { dailyreportrows: where },
            _count: { _all: true },
          }),
          // Registros sin empleados (none) — contar filas sin relaciones
          prisma.dailyreportrows.count({ where: { ...where, dailyreportemployeerelations: { none: {} } } }),
        ]);

        const counts = toFacetMap(rows.map((r) => ({ key: r.employee_id, count: r._count._all })));
        if (rowsWithoutEmployees > 0) {
          counts.set(NULL_FILTER_VALUE, rowsWithoutEmployees);
        }

        const ids = rows.map((r) => r.employee_id).filter((id): id is string => id != null);
        const employees = ids.length
          ? await prisma.employees.findMany({
              where: { id: { in: ids } },
              select: { id: true, firstname: true, lastname: true, file: true },
              orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
            })
          : [];

        const resolvedOptions = employees.map((e) => ({
          value: e.id,
          label: employeeLabel(e),
        }));

        return { counts, resolvedOptions };
      }

      // ── M:M → equipment (vehicles + other_equipment) ─────────────────────
      case 'equipment': {
        const where = crossWhere('equipment');

        // Groupbys y conteo de "sin equipos" en paralelo
        const [vehicleRows, otherRows, rowsWithoutEquipment] = await Promise.all([
          prisma.dailyreportequipmentrelations.groupBy({
            by: ['equipment_id'],
            where: { dailyreportrows: where, equipment_id: { not: null } },
            _count: { _all: true },
          }),
          prisma.dailyreportequipmentrelations.groupBy({
            by: ['other_equipment_id'],
            where: { dailyreportrows: where, other_equipment_id: { not: null } },
            _count: { _all: true },
          }),
          prisma.dailyreportrows.count({ where: { ...where, dailyreportequipmentrelations: { none: {} } } }),
        ]);

        // Combinar counts de ambos tipos en un solo Map
        const counts = new Map<string, number>();
        for (const r of vehicleRows) {
          if (r.equipment_id) counts.set(r.equipment_id, (counts.get(r.equipment_id) ?? 0) + r._count._all);
        }
        for (const r of otherRows) {
          if (r.other_equipment_id)
            counts.set(r.other_equipment_id, (counts.get(r.other_equipment_id) ?? 0) + r._count._all);
        }
        if (rowsWithoutEquipment > 0) {
          counts.set(NULL_FILTER_VALUE, rowsWithoutEquipment);
        }

        const vehicleIds = vehicleRows.map((r) => r.equipment_id).filter((id): id is string => id != null);
        const otherIds = otherRows.map((r) => r.other_equipment_id).filter((id): id is string => id != null);

        const [vehicles, otherEquipment] = await Promise.all([
          vehicleIds.length
            ? prisma.vehicles.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, domain: true, intern_number: true },
                orderBy: { domain: 'asc' },
              })
            : [],
          otherIds.length
            ? prisma.other_equipment.findMany({
                where: { id: { in: otherIds } },
                select: { id: true, intern_number: true, serial_number: true },
                orderBy: { intern_number: 'asc' },
              })
            : [],
        ]);

        const resolvedOptions = [
          ...vehicles.map((v) => ({
            value: v.id,
            label: [v.domain, v.intern_number ? `(${v.intern_number})` : ''].filter(Boolean).join(' ').trim() || '—',
          })),
          ...otherEquipment.map((o) => ({
            value: o.id,
            label: [o.intern_number, o.serial_number].filter(Boolean).join(' / ') || '—',
          })),
        ];

        return { counts, resolvedOptions };
      }

      // ── M:M → customer_equipment ──────────────────────────────────────────
      case 'customer_equipment': {
        const where = crossWhere('customer_equipment');
        const [rows, rowsWithoutCustomerEquipment] = await Promise.all([
          prisma.dailyreport_customer_equipment_relations.groupBy({
            by: ['customer_equipment_id'],
            where: { dailyreportrows: where },
            _count: { _all: true },
          }),
          // Registros sin equipo cliente — contar filas sin relaciones
          prisma.dailyreportrows.count({
            where: { ...where, dailyreport_customer_equipment_relations: { none: {} } },
          }),
        ]);

        const counts = toFacetMap(rows.map((r) => ({ key: r.customer_equipment_id, count: r._count._all })));
        if (rowsWithoutCustomerEquipment > 0) {
          counts.set(NULL_FILTER_VALUE, rowsWithoutCustomerEquipment);
        }

        const ids = rows.map((r) => r.customer_equipment_id).filter((id): id is string => id != null);
        const items = ids.length
          ? await prisma.equipos_clientes.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

        const nameMap = new Map(items.map((i) => [i.id, i.name]));

        const resolvedOptions = rows
          .filter((r) => r.customer_equipment_id != null)
          .map((r) => ({
            value: r.customer_equipment_id!,
            label: nameMap.get(r.customer_equipment_id!) ?? r.customer_equipment_id!,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      default:
        logger.warn('columnId no soportado en getDailyReportDetailSingleFacet', {
          data: { columnId },
        });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet del parte diario', {
      data: { error, dailyReportId, columnId },
    });
    return null;
  }
}
