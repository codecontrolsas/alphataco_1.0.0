'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { employeeLabel } from '@/shared/lib/resource-labels';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

import { assertDiagramAccess } from '../lib/diagram-access';
import { diagramDayKey } from '../lib/diagram-dates';
import { uuidLike } from '../lib/diagram-ids';
import {
  DEFAULT_ORDER,
  DIAGRAM_REPORT_SELECT,
  buildOrderBy,
  buildWhereClause,
  parseDay,
  toReportRow,
} from './lib/report-query';

const logger = new Logger('Employees/Diagrams/Reports/actions.server');

/** Tope de filas del export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Tamaño máximo de página. */
const MAX_PAGE_SIZE = 200;

/** Máximo de movimientos del historial de una casilla que se devuelven. */
const HISTORY_MAX_ROWS = 30;

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getDiagramReportsPaginated(searchParams: DataTableSearchParams) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = buildWhereClause(companyId, state);

    const [records, total] = await Promise.all([
      prisma.employees_diagram.findMany({
        skip,
        take,
        orderBy: buildOrderBy(state),
        where,
        select: DIAGRAM_REPORT_SELECT,
      }),
      prisma.employees_diagram.count({ where }),
    ]);

    return { data: records.map(toReportRow), total };
  } catch (error) {
    logger.error('Error al obtener reportes de diagramas paginados', { data: { error } });
    throw new Error(`Error al obtener los reportes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type DiagramReportListItem = Awaited<ReturnType<typeof getDiagramReportsPaginated>>['data'][number];

// ============================================================================
// TOTALES POR NOVEDAD
// ============================================================================

/**
 * Cantidad de novedades por tipo con TODOS los filtros activos (también el propio tipo: son los totales de lo
 * que muestra la tabla). Un `groupBy` y una consulta de nombres; no depende de la página ni del orden.
 */
export async function getDiagramReportTotals(searchParams: DataTableSearchParams) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const where = buildWhereClause(companyId, parseSearchParams(searchParams));
    const groups = await prisma.employees_diagram.groupBy({ by: ['diagram_type'], where, _count: true });

    const types = groups.length
      ? await prisma.diagram_type.findMany({
          where: { id: { in: groups.map((g) => g.diagram_type) }, company_id: companyId },
          select: { id: true, name: true, color: true, short_description: true },
        })
      : [];
    const typeById = new Map(types.map((type) => [type.id, type]));

    const items = groups
      .flatMap((group) => {
        const type = typeById.get(group.diagram_type);
        return type
          ? [
              {
                id: type.id,
                name: type.name ?? type.short_description,
                shortDescription: type.short_description,
                color: type.color,
                count: group._count,
              },
            ]
          : [];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { total: items.reduce((sum, item) => sum + item.count, 0), items };
  } catch (error) {
    logger.error('Error al obtener los totales por novedad', { data: { error } });
    throw new Error('Error al obtener los totales por novedad');
  }
}

// ============================================================================
// EXPORT QUERY (all data, no pagination)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla. Tope de `EXPORT_MAX_ROWS`: si se supera devuelve
 * `{ ok: false, message }` (Next enmascara el mensaje de un error lanzado). El cliente lo abre con `unwrapExportResult`.
 */
export async function getDiagramReportsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<DiagramReportListItem[]>> {
  try {
    await assertDiagramAccess('reports');
  } catch {
    return { ok: false, message: 'No tenés permiso para exportar los reportes de novedades' };
  }
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);

    const records = await prisma.employees_diagram.findMany({
      orderBy: [{ employees: { lastname: 'asc' } }, { employees: { firstname: 'asc' } }, ...DEFAULT_ORDER],
      where,
      select: DIAGRAM_REPORT_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (records.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: records.map(toReportRow) };
  } catch (error) {
    logger.error('Error al exportar reportes de diagramas', { data: { error } });
    return { ok: false, message: 'Error al exportar los reportes de diagramas' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse. Si la consulta falla se loguea y
 * devuelve counts vacíos (el filtro queda sin opciones en vez de romper la tabla).
 */
export async function getDiagramReportSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const state = parseSearchParams(searchParams ?? {});
    // Cross-filter: los counts de una faceta no se condicionan por su propia selección.
    const where = buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    // ── employee FK (group by employee_id, resolve names) ──────────────────
    if (columnId === 'employee') {
      const rows = await prisma.employees_diagram.groupBy({
        by: ['employee_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.employee_id, count: r._count })));
      const ids = rows.map((r) => r.employee_id);
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.employees.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, lastname: true, firstname: true, file: true },
                orderBy: { lastname: 'asc' },
              })
            ).map((e) => ({ id: e.id, name: employeeLabel(e) }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── diagramType FK (group by diagram_type, resolve names) ──────────────
    if (columnId === 'diagramType') {
      const rows = await prisma.employees_diagram.groupBy({
        by: ['diagram_type'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.diagram_type, count: r._count })));
      const ids = rows.map((r) => r.diagram_type);
      const resolvedOptions =
        ids.length > 0
          ? await prisma.diagram_type.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];
      return { counts, resolvedOptions };
    }

    // ── companyPosition FK (puesto del empleado) ────────────────────────────
    if (columnId === 'companyPosition') {
      // No se puede agrupar por un campo de la relación: se agrupa por empleado (una fila por empleado,
      // no por novedad) y el puesto se resuelve con una sola consulta sobre esos empleados.
      const perEmployee = await prisma.employees_diagram.groupBy({
        by: ['employee_id'],
        where,
        _count: true,
      });
      const employeeIds = perEmployee.map((r) => r.employee_id);
      const employees = employeeIds.length
        ? await prisma.employees.findMany({
            where: { id: { in: employeeIds }, company_id: companyId },
            select: { id: true, company_position: true },
          })
        : [];
      const positionByEmployee = new Map(employees.map((e) => [e.id, e.company_position]));
      const rowsByPosition = new Map<string | null, number>();
      for (const row of perEmployee) {
        const position = positionByEmployee.get(row.employee_id) ?? null;
        rowsByPosition.set(position, (rowsByPosition.get(position) ?? 0) + row._count);
      }
      const counts = toFacetMap([...rowsByPosition].map(([key, count]) => ({ key, count })));

      const ids = [...rowsByPosition.keys()].filter((id): id is string => id != null);
      const resolvedOptions =
        ids.length > 0
          ? await prisma.company_positions.findMany({
              where: { id: { in: ids }, company_id: companyId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

      return { counts, resolvedOptions };
    }

    logger.warn('Facet column not recognized', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de diagrama', { data: { error, columnId } });
    return { counts: new Map() };
  }
}

// ============================================================================
// DETALLE DE UNA NOVEDAD: HISTORIAL Y TIPOS EDITABLES
// ============================================================================

/**
 * Movimientos de una casilla (empleado + día), del más nuevo al más viejo. Salen de `diagrams_logs`, que arma un
 * trigger al crear o cambiar una novedad. El log no apunta a la fila de `employees_diagram`: se ubica por
 * empleado y por el día que guarda en `prev_date` (medianoche del día de la novedad).
 */
export async function getDiagramCellHistory(employeeId: string, date: string) {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);
  if (!uuidLike.safeParse(employeeId).success) throw new Error('Empleado inválido');
  const day = parseDay(date);
  if (!day) throw new Error('Fecha inválida');

  try {
    const dayStart = moment.utc(diagramDayKey(day), 'YYYY-MM-DD');
    const logs = await prisma.diagrams_logs.findMany({
      where: {
        employee_id: employeeId,
        employees: { company_id: companyId },
        prev_date: { gte: dayStart.toDate(), lt: dayStart.clone().add(1, 'day').toDate() },
      },
      select: {
        id: true,
        created_at: true,
        description: true,
        state: true,
        prev_state: true,
        profile: { select: { fullname: true } },
      },
      orderBy: { created_at: 'desc' },
      take: HISTORY_MAX_ROWS,
    });

    return logs.map((log) => ({
      id: log.id,
      changedAt: log.created_at,
      shortDescription: log.description,
      state: log.state,
      previousState: log.prev_state,
      changedBy: log.profile?.fullname ?? null,
    }));
  } catch (error) {
    logger.error('Error al obtener el historial de la novedad', { data: { error, employeeId, date } });
    throw new Error('Error al obtener el historial de la novedad');
  }
}

export type DiagramCellHistoryItem = Awaited<ReturnType<typeof getDiagramCellHistory>>[number];

/** Tipos de novedad activos de la empresa para el selector de la edición rápida. */
export async function getReportDiagramTypes() {
  const [, companyId] = await Promise.all([assertDiagramAccess('reports'), getActiveCompanyId()]);

  try {
    const types = await prisma.diagram_type.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, name: true, color: true, short_description: true },
      orderBy: { name: 'asc' },
    });
    return types.map((type) => ({
      id: type.id,
      name: type.name ?? type.short_description,
      color: type.color,
      shortDescription: type.short_description,
    }));
  } catch (error) {
    logger.error('Error al obtener los tipos de novedad activos', { data: { error } });
    throw new Error('Error al obtener los tipos de novedad');
  }
}

export type ReportDiagramType = Awaited<ReturnType<typeof getReportDiagramTypes>>[number];
