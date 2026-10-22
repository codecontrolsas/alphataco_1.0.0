'use server';

import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel, vehicleLabel } from '@/shared/lib/resource-labels';
import { runFacet, toFacetMap, withoutOwnFilter, type FacetConfig } from '@/shared/lib/table-facets';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { SHARED_ROW_FACETS } from '../../lib/row-facets';
import { mapCertificationRow } from '../lib/map-row';
import { CERTIFICATION_ROW_SELECT, MAX_PAGE_SIZE, buildOrderBy, buildWhereClause } from '../lib/row-query';

const logger = new Logger('features/Operaciones/Certificacion/queries');

// ============================================================================
// 1. TABLA PAGINADA
// ============================================================================

/**
 * Líneas de parte diario del tablero comercial, paginadas en la base: filtros, orden y página se
 * resuelven en SQL, y la fila ya sale aplanada para la tabla (`mapCertificationRow`).
 *
 * Perímetro: siempre acotado por `dailyreport.company_id` = empresa activa. El tamaño de página
 * está acotado a `MAX_PAGE_SIZE` aunque la URL pida más.
 */
export async function getCertificationRowsPaginated(searchParams: DataTableSearchParams) {
  try {
    const state = parseSearchParams(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(state, companyId);

    // El tamaño de página se acota ANTES de calcular el skip (la URL no es confiable).
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });

    const [rows, total] = await Promise.all([
      prisma.dailyreportrows.findMany({
        where,
        orderBy: buildOrderBy(state.sorting),
        skip,
        take,
        select: CERTIFICATION_ROW_SELECT,
      }),
      prisma.dailyreportrows.count({ where }),
    ]);

    return { data: rows.map(mapCertificationRow), total };
  } catch (error) {
    logger.error('Error al obtener las líneas paginadas del tablero de certificación', { data: { error } });
    throw new Error('No se pudieron obtener las líneas del tablero. Intente nuevamente.');
  }
}

/** Línea del tablero de certificación (la que consumen la tabla, el formulario y el modal de detalle). */
export type CertificationRow = Awaited<ReturnType<typeof getCertificationRowsPaginated>>['data'][number];

// ============================================================================
// 2. EXPORT (sin paginación, en tandas y con tope)
// ============================================================================

/**
 * Líneas del tablero para el Excel: respeta los filtros activos y el orden por defecto, sin paginar.
 * Se trae por tandas y con tope (`EXPORT_MAX_ROWS`, ver `shared/lib/export-batches.ts`).
 *
 * Devuelve `ExportResult` en vez de lanzar cuando se supera el tope: Next enmascara el mensaje de un error
 * lanzado desde una server action en producción y el usuario no vería "acote la exportación".
 */
export async function getCertificationRowsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<CertificationRow[]>> {
  try {
    const state = parseSearchParams(searchParams);
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(state, companyId);
    const orderBy = buildOrderBy(state.sorting);

    const rows = await fetchExportRowsInBatches({
      listIds: (take) => prisma.dailyreportrows.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.dailyreportrows.findMany({ where: { id: { in: ids } }, select: CERTIFICATION_ROW_SELECT }),
      tooLargeMessage: tooManyRowsMessage('líneas'),
    });
    return { ok: true, data: rows.map(mapCertificationRow) };
  } catch (error) {
    if (error instanceof ExportTooLargeError) return { ok: false, message: error.message };
    logger.error('Error al exportar las líneas del tablero de certificación', { data: { error } });
    return { ok: false, message: 'No se pudieron exportar las líneas del tablero. Intente nuevamente.' };
  }
}

// ============================================================================
// 3. FACETAS (lazy-load con cross-filter)
// ============================================================================

type FacetWhere = ReturnType<typeof buildWhereClause>;

/** Facetas de una sola columna, resueltas por el motor genérico `runFacet` (`shared/lib/table-facets`). */
const FACET_CONFIG: Record<string, FacetConfig<FacetWhere>> = {
  ...SHARED_ROW_FACETS,
  // areas_service_id → service_areas → areas_cliente (la celda muestra `nombre`: la opción también)
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
        select: { id: true, areas_cliente: { select: { id: true, nombre: true } } },
      });
      return new Map(
        rows.flatMap((sa) =>
          sa.areas_cliente ? [[sa.id, { value: sa.areas_cliente.id, label: sa.areas_cliente.nombre }] as const] : []
        )
      );
    },
  },
};

/**
 * Counts + opciones resueltas de UNA columna del filtro faceteado, con cross-filter: se excluye el
 * filtro propio para mostrar cuántas líneas tendría cada opción si se cambiara solo ese filtro.
 *
 * Columnas: status, type_service, working_day, customer, service, item, sector, area (tabla `FACET_CONFIG`)
 * y employees, equipment, customer_equipment (M:M, a mano). Devuelve `null` si la columna no es soportada
 * o la consulta falló (el filtro queda vacío en vez de romper la tabla).
 */
export async function getCertificationSingleFacet(columnId: string, searchParams?: DataTableSearchParams) {
  try {
    const companyId = await getActiveCompanyId();

    const crossWhere = (excludeColumn: string) =>
      buildWhereClause(withoutOwnFilter(parseSearchParams(searchParams ?? {}), excludeColumn), companyId);

    const config = FACET_CONFIG[columnId];
    if (config) {
      return await runFacet(config, crossWhere(columnId));
    }

    switch (columnId) {
      // ── M:M → empleados ───────────────────────────────────────────────────
      case 'employees': {
        const where = crossWhere('employees');
        const [rows, rowsWithoutEmployees] = await Promise.all([
          prisma.dailyreportemployeerelations.groupBy({
            by: ['employee_id'],
            where: { dailyreportrows: where },
            _count: { _all: true },
          }),
          prisma.dailyreportrows.count({ where: { AND: [where, { dailyreportemployeerelations: { none: {} } }] } }),
        ]);

        const counts = toFacetMap(rows.map((r) => ({ key: r.employee_id, count: r._count._all })));
        if (rowsWithoutEmployees > 0) counts.set(NULL_FILTER_VALUE, rowsWithoutEmployees);

        const ids = rows.map((r) => r.employee_id).filter((id): id is string => id != null);
        const employees = ids.length
          ? await prisma.employees.findMany({
              where: { id: { in: ids } },
              select: { id: true, firstname: true, lastname: true, file: true },
              orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
            })
          : [];

        return {
          counts,
          resolvedOptions: employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) })),
        };
      }

      // ── M:M → equipos propios (vehículos) ─────────────────────────────────
      case 'equipment': {
        const where = crossWhere('equipment');
        const [rows, rowsWithoutEquipment] = await Promise.all([
          prisma.dailyreportequipmentrelations.groupBy({
            by: ['equipment_id'],
            where: { dailyreportrows: where, equipment_id: { not: null } },
            _count: { _all: true },
          }),
          prisma.dailyreportrows.count({
            where: { AND: [where, { dailyreportequipmentrelations: { none: { equipment_id: { not: null } } } }] },
          }),
        ]);

        const counts = toFacetMap(rows.map((r) => ({ key: r.equipment_id, count: r._count._all })));
        if (rowsWithoutEquipment > 0) counts.set(NULL_FILTER_VALUE, rowsWithoutEquipment);

        const ids = rows.map((r) => r.equipment_id).filter((id): id is string => id != null);
        const vehicles = ids.length
          ? await prisma.vehicles.findMany({
              where: { id: { in: ids } },
              select: { id: true, domain: true, intern_number: true },
            })
          : [];

        const resolvedOptions = vehicles
          .map((vehicle) => ({ value: vehicle.id, label: vehicleLabel(vehicle) || '—' }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { counts, resolvedOptions };
      }

      // ── M:M → equipos del cliente ─────────────────────────────────────────
      case 'customer_equipment': {
        const where = crossWhere('customer_equipment');
        const [rows, rowsWithoutCustomerEquipment] = await Promise.all([
          prisma.dailyreport_customer_equipment_relations.groupBy({
            by: ['customer_equipment_id'],
            where: { dailyreportrows: where },
            _count: { _all: true },
          }),
          prisma.dailyreportrows.count({
            where: { AND: [where, { dailyreport_customer_equipment_relations: { none: {} } }] },
          }),
        ]);

        const counts = toFacetMap(rows.map((r) => ({ key: r.customer_equipment_id, count: r._count._all })));
        if (rowsWithoutCustomerEquipment > 0) counts.set(NULL_FILTER_VALUE, rowsWithoutCustomerEquipment);

        const ids = rows.map((r) => r.customer_equipment_id).filter((id): id is string => id != null);
        const items = ids.length
          ? await prisma.equipos_clientes.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

        return { counts, resolvedOptions: items.map((item) => ({ value: item.id, label: item.name })) };
      }

      default:
        logger.warn('columnId no soportado en getCertificationSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta del tablero de certificación', { data: { error, columnId } });
    return null;
  }
}
