'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Prisma } from '@/generated/prisma/client';
import { status_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { booleanFilterWhere, cleanFacetFilters, exportTooLargeMessage, isUuid } from '../lib/table-where';

const logger = new Logger('features/Empresa/Clientes/employees');

// ============================================================================
// CONSTANTES
// ============================================================================

const MODULE_SLUG = 'comercial';
const TAB_SLUG = 'empleados-cliente';

const EMPLOYEE_EXPORT_MAX_ROWS = 10_000;

/** Columnas de texto (`contains`); `fullname` filtra por la columna generada `full_name`. */
const TEXT_COLUMNS = ['fullname', 'cuil', 'document_number', 'phone', 'email'];
const TEXT_COLUMN_MAP: Record<string, string> = { fullname: 'full_name' };

/** Columnas facetadas que son una FK directa del empleado o un enum. */
const FACET_COLUMN_MAP: Record<string, string> = {
  company_position: 'company_position',
  hierarchical_position: 'hierarchical_position',
  type_of_contract: 'type_of_contract',
  status: 'status',
};

const DATE_RANGE_COLUMNS = ['date_of_admission'];

const ALLOWED_FILTER_PARAMS = new Set([
  ...TEXT_COLUMNS,
  ...Object.keys(FACET_COLUMN_MAP),
  'file',
  'is_active',
  ...dateRangeKeys([...DATE_RANGE_COLUMNS, 'affected_since']),
]);

const VALID_STATUS = new Set<string>(Object.values(status_type));

const SEARCH_FIELDS = ['file', 'full_name', 'cuil', 'document_number', 'phone', 'email'] as const;

/** `is_active` queda afuera: los empleados dados de baja siempre van al final. */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.employeesOrderByWithRelationInput[]> = {
  file: (dir) => [{ file: dir }],
  fullname: (dir) => [{ lastname: dir }, { firstname: dir }],
  cuil: (dir) => [{ cuil: dir }],
  document_number: (dir) => [{ document_number: dir }],
  phone: (dir) => [{ phone: dir }],
  email: (dir) => [{ email: dir }],
  status: (dir) => [{ status: dir }],
  date_of_admission: (dir) => [{ date_of_admission: dir }],
  company_position: (dir) => [{ company_positions: { name: dir } }],
  hierarchical_position: (dir) => [{ hierarchy: { name: dir } }],
  type_of_contract: (dir) => [{ types_of_contract: { name: dir } }],
};

// ============================================================================
// SELECT
// ============================================================================

function employeeListSelect(customerId: string) {
  return {
    id: true,
    file: true,
    lastname: true,
    firstname: true,
    cuil: true,
    document_number: true,
    phone: true,
    email: true,
    is_active: true,
    status: true,
    date_of_admission: true,
    company_positions: { select: { id: true, name: true } },
    hierarchy: { select: { id: true, name: true } },
    types_of_contract: { select: { id: true, name: true } },
    // La afectación de ESTE cliente (la pivote es única por empleado + cliente).
    contractor_employee: { where: { contractor_id: customerId }, select: { created_at: true }, take: 1 },
  } satisfies Prisma.employeesSelect;
}

type EmployeeListQueryRow = Prisma.employeesGetPayload<{ select: ReturnType<typeof employeeListSelect> }>;

function serializeEmployee(row: EmployeeListQueryRow) {
  const { contractor_employee, ...rest } = row;
  return { ...rest, affected_since: contractor_employee[0]?.created_at ?? null };
}

// ============================================================================
// WHERE / ORDER BY
// ============================================================================

type TableState = ReturnType<typeof parseSearchParams>;

function sanitizeState(state: TableState): TableState {
  const allowed = sanitizeFilters(state, ALLOWED_FILTER_PARAMS);
  return {
    ...allowed,
    filters: cleanFacetFilters(allowed.filters, {
      company_position: isUuid,
      hierarchical_position: isUuid,
      type_of_contract: isUuid,
      status: (value) => VALID_STATUS.has(value),
    }),
  };
}

/** `where` único de la paginada, el export y las facetas. El perímetro (empresa + cliente) va primero. */
function buildWhereClause(companyId: string, customerId: string, state: TableState): Prisma.employeesWhereInput {
  const AND: Prisma.employeesWhereInput[] = [
    { company_id: companyId },
    { contractor_employee: { some: { contractor_id: customerId, customers: { company_id: companyId } } } },
  ];

  const term = state.search.trim();
  if (term) {
    AND.push({
      OR: SEARCH_FIELDS.map((field) => ({
        [field]: field === 'file' ? { equals: term, mode: 'insensitive' } : { contains: term, mode: 'insensitive' },
      })) as Prisma.employeesWhereInput[],
    });
  }

  // Legajo: coincidencia EXACTA. Con `contains`, buscar "1" devolvería 1, 10, 100, 101...
  const file = state.filters.file?.[0]?.trim();
  if (file) AND.push({ file: { equals: file, mode: 'insensitive' } });

  AND.push(buildTextFiltersWhere(state.filters, TEXT_COLUMNS, TEXT_COLUMN_MAP) as Prisma.employeesWhereInput);
  // Solo las columnas facetadas: el resto de las claves tiene su propio armado más abajo.
  AND.push(
    buildFiltersWhere(
      Object.fromEntries(Object.entries(state.filters).filter(([key]) => key in FACET_COLUMN_MAP)),
      FACET_COLUMN_MAP
    ) as Prisma.employeesWhereInput
  );

  const active = booleanFilterWhere('is_active', state.filters.is_active);
  if (active) AND.push(active as Prisma.employeesWhereInput);

  AND.push(buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.employeesWhereInput);

  const affectedRange = buildDateRangeFiltersWhere(state.filters, ['affected_since'], { affected_since: 'created_at' });
  if (Object.keys(affectedRange).length > 0) {
    AND.push({
      contractor_employee: {
        some: { contractor_id: customerId, ...(affectedRange as Prisma.contractor_employeeWhereInput) },
      },
    });
  }

  return { AND };
}

function buildOrderBy(state: TableState): Prisma.employeesOrderByWithRelationInput[] {
  const userSorts: Prisma.employeesOrderByWithRelationInput[] = [];
  for (const sort of state.sorting) {
    const resolve = SORT_MAP[sort.id];
    if (resolve) userSorts.push(...resolve(sort.desc ? 'desc' : 'asc'));
  }
  return [
    { is_active: { sort: 'desc', nulls: 'last' } },
    ...userSorts,
    { lastname: 'asc' },
    { firstname: 'asc' },
    { id: 'asc' },
  ];
}

async function canViewEmployees(): Promise<boolean> {
  return checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view');
}

// ============================================================================
// PAGINADA
// ============================================================================

/** Empleados afectados a UN cliente de la empresa activa, paginados en el servidor. */
export async function getCustomerEmployeesPaginated(customerId: string, searchParams: DataTableSearchParams) {
  if (!(await canViewEmployees())) throw new Error('No tenés permiso para ver los empleados del cliente');

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, customerId, state);

    const [rows, total] = await Promise.all([
      prisma.employees.findMany({
        where,
        orderBy: buildOrderBy(state),
        skip,
        take,
        select: employeeListSelect(customerId),
      }),
      prisma.employees.count({ where }),
    ]);

    return { data: rows.map(serializeEmployee), total };
  } catch (error) {
    logger.error('Error al obtener los empleados del cliente', { data: { error, customerId } });
    throw new Error('No se pudieron cargar los empleados del cliente. Intente nuevamente.');
  }
}

export type CustomerEmployeeItem = Awaited<ReturnType<typeof getCustomerEmployeesPaginated>>['data'][number];

// ============================================================================
// EXPORT
// ============================================================================

export async function getAllCustomerEmployeesForExport(
  customerId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<CustomerEmployeeItem[]>> {
  if (!(await canViewEmployees())) return { ok: false, message: 'No tenés permiso para exportar los empleados' };

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const rows = await prisma.employees.findMany({
      where: buildWhereClause(companyId, customerId, state),
      orderBy: buildOrderBy(state),
      select: employeeListSelect(customerId),
      take: EMPLOYEE_EXPORT_MAX_ROWS + 1,
    });

    if (rows.length > EMPLOYEE_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportTooLargeMessage(EMPLOYEE_EXPORT_MAX_ROWS, 'empleados') };
    }
    return { ok: true, data: rows.map(serializeEmployee) };
  } catch (error) {
    logger.error('Error al exportar los empleados del cliente', { data: { error, customerId } });
    return { ok: false, message: 'No se pudo exportar la lista de empleados. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS
// ============================================================================

type FacetOption = { value: string; label: string };

/** Faceta de UNA columna con cross-filter (los conteos excluyen el filtro propio). */
export async function getCustomerEmployeeSingleFacet(
  customerId: string,
  columnId: string,
  searchParams: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: FacetOption[] } | null> {
  if (!(await canViewEmployees())) return null;

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = buildWhereClause(companyId, customerId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'status': {
        const rows = await prisma.employees.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.status, count: row._count }))) };
      }
      case 'is_active': {
        const rows = await prisma.employees.groupBy({ by: ['is_active'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.is_active, count: row._count }))) };
      }
      case 'company_position': {
        const rows = await prisma.employees.groupBy({ by: ['company_position'], where, _count: true });
        const ids = rows.flatMap((row) => (row.company_position ? [row.company_position] : []));
        const positions = await prisma.company_positions.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.company_position, count: row._count }))),
          resolvedOptions: positions.map((p) => ({ value: p.id, label: p.name ?? 'Puesto sin nombre' })),
        };
      }
      case 'hierarchical_position': {
        const rows = await prisma.employees.groupBy({ by: ['hierarchical_position'], where, _count: true });
        const ids = rows.flatMap((row) => (row.hierarchical_position ? [row.hierarchical_position] : []));
        const sectors = await prisma.hierarchy.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.hierarchical_position, count: row._count }))),
          resolvedOptions: sectors.map((s) => ({ value: s.id, label: s.name })),
        };
      }
      case 'type_of_contract': {
        const rows = await prisma.employees.groupBy({ by: ['type_of_contract'], where, _count: true });
        const ids = rows.flatMap((row) => (row.type_of_contract ? [row.type_of_contract] : []));
        const types = await prisma.types_of_contract.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.type_of_contract, count: row._count }))),
          resolvedOptions: types.map((t) => ({ value: t.id, label: t.name })),
        };
      }
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de empleados del cliente', { data: { error, customerId, columnId } });
    return null;
  }
}

// ============================================================================
// OPCIONES DEL MODAL DE AFECTACIÓN
// ============================================================================

/**
 * Empleados ACTIVOS de la empresa que se pueden afectar al cliente (consulta liviana, se pide al abrir el
 * modal). Los dados de baja no se ofrecen: no se afectan nuevos recursos inactivos.
 */
export async function getAssignableEmployeeOptions() {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'update'))) {
    throw new Error('No tenés permiso para afectar empleados al cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.employees.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, file: true, firstname: true, lastname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });
  } catch (error) {
    logger.error('Error al obtener los empleados asignables', { data: { error } });
    throw new Error('No se pudo cargar la lista de empleados');
  }
}
