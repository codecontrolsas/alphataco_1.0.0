'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { booleanFilterWhere, digitsOnly } from '../lib/table-where';

const logger = new Logger('features/Empresa/Clientes/list');

// ============================================================================
// CONSTANTES
// ============================================================================

const MODULE_SLUG = 'comercial';
const TAB_SLUG = 'customers';

/** Tope de filas del export: más que esto se pide acotar con filtros. */
const CUSTOMER_EXPORT_MAX_ROWS = 10_000;

/** Columnas de texto (`contains`, sin distinguir mayúsculas). */
const TEXT_COLUMNS = ['name', 'client_email', 'address'];

/** CUIT y teléfono son `bigint`: no admiten `contains`, se filtran por coincidencia parcial de dígitos. */
const NUMERIC_TEXT_COLUMNS = ['cuit', 'client_phone'] as const;
type NumericTextColumn = (typeof NUMERIC_TEXT_COLUMNS)[number];

const DATE_RANGE_COLUMNS = ['created_at'];

/** Campos de búsqueda global (los numéricos se agregan aparte). */
const SEARCH_FIELDS = ['name', 'client_email', 'address'];

/** Únicas claves de la URL que filtran esta tabla: el resto se descarta antes de armar el `where`. */
const ALLOWED_FILTER_PARAMS = new Set([
  ...TEXT_COLUMNS,
  ...NUMERIC_TEXT_COLUMNS,
  'is_active',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Columnas ordenables (`is_active` no: los inactivos siempre van al final). */
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'cuit',
  'name',
  'client_email',
  'client_phone',
  'address',
  'created_at',
]);

const CUSTOMER_LIST_SELECT = {
  id: true,
  name: true,
  cuit: true,
  client_email: true,
  client_phone: true,
  address: true,
  is_active: true,
  created_at: true,
} satisfies Prisma.customersSelect;

type CustomerListQueryRow = Prisma.customersGetPayload<{ select: typeof CUSTOMER_LIST_SELECT }>;

/** `cuit` y `client_phone` son `bigint` en la base: hacia el cliente viajan como texto. */
function serializeCustomerListItem(row: CustomerListQueryRow) {
  return {
    id: row.id,
    name: row.name,
    cuit: row.cuit.toString(),
    client_email: row.client_email,
    client_phone: row.client_phone === null ? null : row.client_phone.toString(),
    address: row.address,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

// ============================================================================
// WHERE / ORDER BY
// ============================================================================

type TableState = ReturnType<typeof parseSearchParams>;

function sanitizeState(state: TableState): TableState {
  return sanitizeFilters(state, ALLOWED_FILTER_PARAMS);
}

/** Ids de los clientes de la empresa cuya columna `bigint` contiene los dígitos buscados. */
async function customerIdsByDigits(companyId: string, column: NumericTextColumn, digits: string): Promise<string[]> {
  if (!digits) return [];
  const pattern = `%${digits}%`;
  const rows =
    column === 'cuit'
      ? await prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id::text AS id FROM public.customers WHERE company_id = ${companyId}::uuid AND cuit::text LIKE ${pattern}`
        )
      : await prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id::text AS id FROM public.customers WHERE company_id = ${companyId}::uuid AND client_phone::text LIKE ${pattern}`
        );
  return rows.map((row) => row.id);
}

/**
 * `where` único de la paginada, el export y las facetas: todo en un solo `AND` con el perímetro de
 * empresa primero. Compartirlo evita que los filtros diverjan entre las tres consultas.
 */
async function buildWhereClause(companyId: string, state: TableState): Promise<Prisma.customersWhereInput> {
  const AND: Prisma.customersWhereInput[] = [{ company_id: companyId }];

  // Búsqueda global: texto + coincidencia de dígitos en CUIT / teléfono.
  const term = state.search.trim();
  if (term) {
    const or: Prisma.customersWhereInput[] = [...(buildSearchWhere(term, SEARCH_FIELDS).OR ?? [])];
    const digits = digitsOnly(term);
    if (digits.length >= 3) {
      const matches = await Promise.all(
        NUMERIC_TEXT_COLUMNS.map((column) => customerIdsByDigits(companyId, column, digits))
      );
      const ids = Array.from(new Set(matches.flat()));
      if (ids.length > 0) or.push({ id: { in: ids } });
    }
    AND.push({ OR: or });
  }

  AND.push(buildTextFiltersWhere(state.filters, TEXT_COLUMNS) as Prisma.customersWhereInput);
  AND.push(buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.customersWhereInput);

  for (const column of NUMERIC_TEXT_COLUMNS) {
    const digits = digitsOnly(state.filters[column]?.[0] ?? '');
    if (!digits) continue;
    const ids = await customerIdsByDigits(companyId, column, digits);
    // Sin coincidencias el filtro tiene que devolver 0 filas (un `in: []` lo hace).
    AND.push({ id: { in: ids } });
  }

  const active = booleanFilterWhere('is_active', state.filters.is_active);
  if (active) AND.push(active as Prisma.customersWhereInput);

  return { AND };
}

/** Inactivos siempre al final, después el orden elegido (multi-sort) y el desempate por nombre. */
function buildOrderBy(state: TableState): Prisma.customersOrderByWithRelationInput[] {
  const userSorts: Prisma.customersOrderByWithRelationInput[] = [];
  for (const sort of state.sorting) {
    if (!VALID_SORT_FIELDS.has(sort.id)) continue;
    userSorts.push({ [sort.id]: sort.desc ? 'desc' : 'asc' });
  }
  return [{ is_active: { sort: 'desc', nulls: 'last' } }, ...userSorts, { name: 'asc' }, { id: 'asc' }];
}

async function requireView(): Promise<boolean> {
  return checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view');
}

// ============================================================================
// PAGINADA
// ============================================================================

export async function getCustomersPaginated(searchParams: DataTableSearchParams) {
  if (!(await requireView())) throw new Error('No tenés permiso para ver los clientes');

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const { skip, take } = clampedPageParams(state);
    const where = await buildWhereClause(companyId, state);

    const [rows, total] = await Promise.all([
      prisma.customers.findMany({ where, orderBy: buildOrderBy(state), skip, take, select: CUSTOMER_LIST_SELECT }),
      prisma.customers.count({ where }),
    ]);

    return { data: rows.map(serializeCustomerListItem), total };
  } catch (error) {
    logger.error('Error al obtener los clientes paginados', { data: { error } });
    throw new Error('No se pudo obtener la lista de clientes. Intente nuevamente.');
  }
}

export type CustomersListItem = Awaited<ReturnType<typeof getCustomersPaginated>>['data'][number];

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla y tope de `CUSTOMER_EXPORT_MAX_ROWS`. Devuelve
 * `{ ok: false, message }` en vez de lanzar: Next enmascara el mensaje de un error de server action.
 */
export async function getAllCustomersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<CustomersListItem[]>> {
  if (!(await requireView())) return { ok: false, message: 'No tenés permiso para exportar los clientes' };

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = await buildWhereClause(companyId, state);

    const rows = await prisma.customers.findMany({
      where,
      orderBy: buildOrderBy(state),
      select: CUSTOMER_LIST_SELECT,
      take: CUSTOMER_EXPORT_MAX_ROWS + 1,
    });

    if (rows.length > CUSTOMER_EXPORT_MAX_ROWS) {
      return { ok: false, message: tooManyRowsMessage('clientes')(CUSTOMER_EXPORT_MAX_ROWS) };
    }

    return { ok: true, data: rows.map(serializeCustomerListItem) };
  } catch (error) {
    logger.error('Error al exportar los clientes', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista de clientes. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS (lazy-load, una columna por vez)
// ============================================================================

/**
 * Faceta de UNA columna con cross-filter: los conteos excluyen el filtro propio de la columna.
 * Solo `is_active` tiene faceta; el resto de las columnas filtra por texto o fecha.
 */
export async function getCustomerSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams
): Promise<{ counts: Map<string, number> } | null> {
  if (!(await requireView())) return null;

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = await buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    if (columnId === 'is_active') {
      const rows = await prisma.customers.groupBy({ by: ['is_active'], where, _count: true });
      return { counts: toFacetMap(rows.map((row) => ({ key: row.is_active, count: row._count }))) };
    }
    return null;
  } catch (error) {
    logger.error('Error al obtener la faceta de clientes', { data: { error, columnId } });
    return null;
  }
}
