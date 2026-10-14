'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams, stateToPrismaParams, NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
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

export type DailyReportHeaderData = Awaited<ReturnType<typeof getDailyReportHeader>>;

/**
 * Resumen de la franja del detalle: total de registros del parte y cantidad por estado.
 * Mismo universo que la tabla (parte de la empresa activa, sin filtros), en una consulta agrupada.
 */
export async function getDailyReportRowStatusSummary(dailyReportId: string) {
  try {
    const companyId = await getActiveCompanyId();

    const rows = await prisma.dailyreportrows.groupBy({
      by: ['status'],
      where: { daily_report_id: dailyReportId, dailyreport: { company_id: companyId } },
      _count: { _all: true },
    });

    const byStatus: Partial<Record<(typeof rows)[number]['status'], number>> = {};
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      byStatus[row.status] = row._count._all;
    }

    return { total, byStatus };
  } catch (error) {
    logger.error('Error al obtener el resumen del parte diario', { data: { error, dailyReportId } });
    throw new Error('No se pudo obtener el resumen del parte diario. Intente nuevamente.');
  }
}

export type DailyReportRowStatusSummary = Awaited<ReturnType<typeof getDailyReportRowStatusSummary>>;

// ============================================================================
// 2. PAGINATED QUERY
// ============================================================================

/**
 * Obtiene las filas del parte diario con paginación, filtros y ordenamiento.
 * Reemplaza las 4 queries Supabase + RPC del sistema anterior en una sola llamada Prisma.
 *
 * @param dailyReportId - ID del parte diario
 * @param searchParams - Parámetros de búsqueda/filtro/paginación del DataTable
 * @param reportDate - Fecha del parte (YYYY-MM-DD) para filtrar employees_diagram por día
 */
export async function getDailyReportDetailPaginated(
  dailyReportId: string,
  searchParams: DataTableSearchParams,
  reportDate?: string
) {
  logger.debug('Obteniendo filas del parte diario paginadas', {
    data: { dailyReportId, searchParams, reportDate },
  });

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
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

    const rowSelect = buildRowSelect(reportDate);

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

export type DailyReportDetailRow = Awaited<ReturnType<typeof getDailyReportDetailPaginated>>['data'][number];

// ============================================================================
// 4. SINGLE FACET (lazy-load con cross-filter)
// ============================================================================

/**
 * Retorna counts + opciones resueltas para UNA columna del filtro faceteado.
 * Implementa cross-filtering: excluye el filtro propio para mostrar
 * cuántos registros tendría cada opción si se cambiara solo ese filtro.
 *
 * Columnas soportadas: status, type_service, working_day, completed_day,
 * completed_night, customer, service, item, sector, area.
 */
export async function getDailyReportDetailSingleFacet(
  dailyReportId: string,
  columnId: string,
  searchParams?: DataTableSearchParams
) {
  logger.debug('Obteniendo facet del parte diario', { data: { dailyReportId, columnId } });

  // Perímetro: el parte tiene que ser de la empresa activa.
  const companyId = await getActiveCompanyId();

  // Helper para construir el mapa de facetas
  function toFacetMap(rows: { key: string | boolean | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  // Helper: WHERE con todos los filtros EXCEPTO el de la columna indicada
  function crossWhere(excludeColumn: string) {
    if (!searchParams || Object.keys(searchParams).length === 0) {
      return { daily_report_id: dailyReportId, dailyreport: { company_id: companyId } };
    }
    const parsedState = parseSearchParams(searchParams);
    // Eliminar el filtro propio de la columna
    delete parsedState.filters[excludeColumn];
    delete parsedState.filters[`${excludeColumn}_from`];
    delete parsedState.filters[`${excludeColumn}_to`];
    return buildWhereClause(dailyReportId, parsedState, companyId);
  }

  try {
    switch (columnId) {
      // ── Enums directos ────────────────────────────────────────────────────
      case 'status': {
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['status'],
          where: crossWhere('status'),
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.status as string, count: r._count })));
        return { counts };
      }

      case 'type_service': {
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['type_service'],
          where: crossWhere('type_service'),
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.type_service as string | null, count: r._count })));
        return { counts };
      }

      // ── Texto (working_day) ───────────────────────────────────────────────
      case 'working_day': {
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['working_day'],
          where: crossWhere('working_day'),
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.working_day, count: r._count })));
        return { counts };
      }

      // ── Booleanos ─────────────────────────────────────────────────────────
      case 'completed_day': {
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['completed_day'],
          where: crossWhere('completed_day'),
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.completed_day, count: r._count })));
        return { counts };
      }

      case 'completed_night': {
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['completed_night'],
          where: crossWhere('completed_night'),
          _count: true,
        });
        const counts = toFacetMap(rows.map((r) => ({ key: r.completed_night, count: r._count })));
        return { counts };
      }

      // ── FK → customer ─────────────────────────────────────────────────────
      case 'customer': {
        const baseWhere = crossWhere('customer');
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['customer_id'],
          where: baseWhere,
          _count: true,
        });

        // Resolver nombres de customers
        const customerIds = rows.map((r) => r.customer_id).filter((id): id is string => id != null);

        const customers = customerIds.length
          ? await prisma.customers.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true },
            })
          : [];

        const nameMap = new Map(customers.map((c) => [c.id, c.name]));

        const counts = toFacetMap(rows.map((r) => ({ key: r.customer_id, count: r._count })));

        const resolvedOptions = rows
          .filter((r) => r.customer_id != null)
          .map((r) => ({
            value: r.customer_id!,
            label: nameMap.get(r.customer_id!) ?? r.customer_id!,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── FK → service ──────────────────────────────────────────────────────
      case 'service': {
        const baseWhere = crossWhere('service');
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['service_id'],
          where: baseWhere,
          _count: true,
        });

        const serviceIds = rows.map((r) => r.service_id).filter((id): id is string => id != null);

        const services = serviceIds.length
          ? await prisma.customer_services.findMany({
              where: { id: { in: serviceIds } },
              select: { id: true, service_name: true },
            })
          : [];

        const nameMap = new Map(services.map((s) => [s.id, s.service_name ?? s.id]));

        const counts = toFacetMap(rows.map((r) => ({ key: r.service_id, count: r._count })));

        const resolvedOptions = rows
          .filter((r) => r.service_id != null)
          .map((r) => ({
            value: r.service_id!,
            label: nameMap.get(r.service_id!) ?? r.service_id!,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── FK → item ─────────────────────────────────────────────────────────
      case 'item': {
        const baseWhere = crossWhere('item');
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['item_id'],
          where: baseWhere,
          _count: true,
        });

        const itemIds = rows.map((r) => r.item_id).filter((id): id is string => id != null);

        const items = itemIds.length
          ? await prisma.service_items.findMany({
              where: { id: { in: itemIds } },
              select: { id: true, item_name: true },
            })
          : [];

        const nameMap = new Map(items.map((i) => [i.id, i.item_name]));

        const counts = toFacetMap(rows.map((r) => ({ key: r.item_id, count: r._count })));

        const resolvedOptions = rows
          .filter((r) => r.item_id != null)
          .map((r) => ({
            value: r.item_id!,
            label: nameMap.get(r.item_id!) ?? r.item_id!,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── FK → sector (via sector_service_id → service_sectors → sectors) ──
      case 'sector': {
        const baseWhere = crossWhere('sector');
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['sector_service_id'],
          where: baseWhere,
          _count: true,
        });

        const sectorServiceIds = rows.map((r) => r.sector_service_id).filter((id): id is string => id != null);

        const serviceSectors = sectorServiceIds.length
          ? await prisma.service_sectors.findMany({
              where: { id: { in: sectorServiceIds } },
              select: {
                id: true,
                sectors: { select: { id: true, name: true } },
              },
            })
          : [];

        // Mapear: sector_service_id → sector real (id + name)
        const sectorMap = new Map(serviceSectors.map((ss) => [ss.id, ss.sectors]));

        const counts = toFacetMap(
          rows.map((r) => ({
            key: r.sector_service_id ? sectorMap.get(r.sector_service_id)?.id ?? r.sector_service_id : null,
            count: r._count,
          }))
        );

        const resolvedOptions = rows
          .filter((r) => r.sector_service_id != null)
          .map((r) => {
            const sector = sectorMap.get(r.sector_service_id!);
            return {
              value: sector?.id ?? r.sector_service_id!,
              label: sector?.name ?? r.sector_service_id!,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── FK → area (via areas_service_id → service_areas → areas_cliente) ─
      case 'area': {
        const baseWhere = crossWhere('area');
        const rows = await prisma.dailyreportrows.groupBy({
          by: ['areas_service_id'],
          where: baseWhere,
          _count: true,
        });

        const areaServiceIds = rows.map((r) => r.areas_service_id).filter((id): id is string => id != null);

        const serviceAreas = areaServiceIds.length
          ? await prisma.service_areas.findMany({
              where: { id: { in: areaServiceIds } },
              select: {
                id: true,
                areas_cliente: { select: { id: true, descripcion_corta: true } },
              },
            })
          : [];

        // Mapear: areas_service_id → área real (id + descripcion_corta)
        const areaMap = new Map(serviceAreas.map((sa) => [sa.id, sa.areas_cliente]));

        const counts = toFacetMap(
          rows.map((r) => ({
            key: r.areas_service_id ? areaMap.get(r.areas_service_id)?.id ?? r.areas_service_id : null,
            count: r._count,
          }))
        );

        const resolvedOptions = rows
          .filter((r) => r.areas_service_id != null)
          .map((r) => {
            const area = areaMap.get(r.areas_service_id!);
            return {
              value: area?.id ?? r.areas_service_id!,
              label: area?.descripcion_corta ?? r.areas_service_id!,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── M:M → employees ──────────────────────────────────────────────────
      case 'employees': {
        const where = crossWhere('employees');
        const rows = await prisma.dailyreportemployeerelations.groupBy({
          by: ['employee_id'],
          where: { dailyreportrows: where },
          _count: { _all: true },
        });

        // Registros sin empleados (none) — contar filas sin relaciones
        const rowsWithoutEmployees = await prisma.dailyreportrows.count({
          where: { ...where, dailyreportemployeerelations: { none: {} } },
        });

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
          label: `[${e.file ?? '—'}] ${e.lastname ?? ''} ${e.firstname ?? ''}`.trim(),
        }));

        return { counts, resolvedOptions };
      }

      // ── M:M → equipment (vehicles + other_equipment) ─────────────────────
      case 'equipment': {
        const where = crossWhere('equipment');

        // Dos groupBys paralelos: equipment_id (vehicles) y other_equipment_id
        const [vehicleRows, otherRows] = await Promise.all([
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

        // Registros sin equipos — contar filas sin relaciones
        const rowsWithoutEquipment = await prisma.dailyreportrows.count({
          where: { ...where, dailyreportequipmentrelations: { none: {} } },
        });
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
        const rows = await prisma.dailyreport_customer_equipment_relations.groupBy({
          by: ['customer_equipment_id'],
          where: { dailyreportrows: where },
          _count: { _all: true },
        });

        // Registros sin equipo cliente — contar filas sin relaciones
        const rowsWithoutCustomerEquipment = await prisma.dailyreportrows.count({
          where: { ...where, dailyreport_customer_equipment_relations: { none: {} } },
        });

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

export type DailyReportDetailFacetResult = Awaited<ReturnType<typeof getDailyReportDetailSingleFacet>>;

