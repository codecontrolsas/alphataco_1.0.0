'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { withoutOwnFilter } from '@/shared/lib/table-facets';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { runEmployeeFacet, type EmployeeFacetResult } from './lib/employee-list-facets';
import { EMPLOYEE_LIST_SELECT } from './lib/employee-list-select';
import { buildEmployeeOrderBy, buildEmployeeWhere, parseEmployeeListState } from './lib/employee-list-where';

const logger = new Logger('Employees/list/actions.server');

// ============================================================================
// CONSTANTES
// ============================================================================

const MODULE_SLUG = 'empleados';

/** Tope de filas por export: más que esto no se descarga entero (se pide acotar con filtros). */
const EMPLOYEE_EXPORT_MAX_ROWS = 10_000;

/**
 * Permiso `view` de la subpestaña que corresponde al listado pedido. `isActive` lo manda el cliente, así que
 * el permiso se resuelve con él: Activos y Bajas son subpestañas con permisos propios.
 */
async function canViewList(isActive: boolean): Promise<boolean> {
  const tabSlug = isActive === true ? 'empleados-activos' : 'empleados-inactivos';
  return checkPermissionServer(MODULE_SLUG, tabSlug, 'view');
}

// ============================================================================
// FOTO BAJO DEMANDA
// ============================================================================

/**
 * Foto de un empleado, pedida solo cuando el usuario abre el diálogo desde el listado (la foto es un base64
 * pesado y no viaja en las filas). Requiere ver el listado de activos o el de bajas, y acota por la empresa activa.
 */
export async function getEmployeePicture(employeeId: string): Promise<{ picture: string | null }> {
  if (typeof employeeId !== 'string' || employeeId.length === 0) throw new Error('Empleado inválido');

  const [canViewActive, canViewInactive] = await Promise.all([canViewList(true), canViewList(false)]);
  if (!canViewActive && !canViewInactive) throw new Error('No tenés permiso para ver los empleados');

  const companyId = await getActiveCompanyId();

  try {
    const employee = await prisma.employees.findFirst({
      where: withCompany({ id: employeeId }, companyId),
      select: { picture: true },
    });
    return { picture: employee?.picture || null };
  } catch (error) {
    logger.error('Error al obtener la foto del empleado', { data: { error, employeeId } });
    throw error;
  }
}

// ============================================================================
// PAGINADA
// ============================================================================

export async function getEmployeesPaginated(searchParams: DataTableSearchParams, isActive: boolean) {
  const active = isActive === true;
  if (!(await canViewList(active))) throw new Error('No tenés permiso para ver los empleados');

  const companyId = await getActiveCompanyId();

  try {
    const state = parseEmployeeListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildEmployeeWhere(companyId, active, state);

    const [data, total] = await Promise.all([
      prisma.employees.findMany({
        skip,
        take,
        orderBy: buildEmployeeOrderBy(state.sorting),
        where,
        select: EMPLOYEE_LIST_SELECT,
      }),
      prisma.employees.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener empleados paginados', { data: { error } });
    throw new Error('Error al obtener los empleados');
  }
}

export type EmployeeListItem = Awaited<ReturnType<typeof getEmployeesPaginated>>['data'][number];

// ============================================================================
// EXPORT (con tope)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla. Tope de `EMPLOYEE_EXPORT_MAX_ROWS`: si se supera devuelve
 * `{ ok: false, message }` (Next enmascara el mensaje de un error lanzado). El cliente lo abre con `unwrapExportResult`.
 */
export async function getAllEmployeesForExport(
  searchParams: DataTableSearchParams,
  isActive: boolean
): Promise<ExportResult<EmployeeListItem[]>> {
  const active = isActive === true;
  if (!(await canViewList(active))) {
    return { ok: false, message: 'No tenés permiso para exportar los empleados' };
  }

  const companyId = await getActiveCompanyId();

  try {
    const state = parseEmployeeListState(searchParams);
    const where = buildEmployeeWhere(companyId, active, state);

    const data = await prisma.employees.findMany({
      orderBy: [{ lastname: 'asc' }, { id: 'asc' }],
      where,
      select: EMPLOYEE_LIST_SELECT,
      take: EMPLOYEE_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > EMPLOYEE_EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación de empleados supera el máximo de ${EMPLOYEE_EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar empleados', { data: { error } });
    return { ok: false, message: 'Error al exportar los empleados' };
  }
}

// ============================================================================
// FACETA DE UNA COLUMNA (lazy-load)
// ============================================================================

/**
 * Opciones y conteos de UN filtro facetado, con cross-filter (sin el filtro propio de la columna).
 * Ante un error o sin permiso devuelve conteos vacíos: el filtro queda sin opciones, no rompe la tabla.
 */
export async function getEmployeeSingleFacet(
  columnId: string,
  isActive: boolean,
  searchParams?: DataTableSearchParams
): Promise<EmployeeFacetResult> {
  const active = isActive === true;
  if (!(await canViewList(active))) return { counts: new Map() };

  const companyId = await getActiveCompanyId();

  try {
    const state = withoutOwnFilter(parseEmployeeListState(searchParams), columnId);
    const where = buildEmployeeWhere(companyId, active, state);
    return await runEmployeeFacet(columnId, where, companyId);
  } catch (error) {
    logger.error('Error al obtener la faceta del listado de empleados', { data: { error, columnId } });
    return { counts: new Map() };
  }
}

// ============================================================================
// MÉTRICAS
// ============================================================================

/**
 * Resumen para las tarjetas del listado de activos: cuántos empleados hay en cada estado documental.
 * Una sola consulta agrupada (no un `count` por estado).
 */
export async function getEmployeeStatusMetrics() {
  if (!(await canViewList(true))) throw new Error('No tenés permiso para ver los empleados');

  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.employees.groupBy({
      by: ['status'],
      where: { company_id: companyId, is_active: true },
      _count: { _all: true },
    });

    const byStatus: Partial<Record<NonNullable<(typeof rows)[number]['status']>, number>> = {};
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      if (row.status) byStatus[row.status] = row._count._all;
    }

    return { total, byStatus };
  } catch (error) {
    logger.error('Error al obtener las métricas de empleados', { data: { error } });
    throw new Error('Error al obtener las métricas de empleados');
  }
}
