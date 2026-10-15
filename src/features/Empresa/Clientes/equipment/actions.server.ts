'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Prisma } from '@/generated/prisma/client';
import { condition_enum, status_type } from '@/generated/prisma/enums';
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
import {
  booleanFilterWhere,
  cleanFacetFilters,
  exportTooLargeMessage,
  intFkFilterWhere,
  isUuid,
} from '../lib/table-where';

const logger = new Logger('features/Empresa/Clientes/equipment');

// ============================================================================
// CONSTANTES
// ============================================================================

const MODULE_SLUG = 'comercial';
const TAB_SLUG = 'equipos-cliente';

const EQUIPMENT_EXPORT_MAX_ROWS = 10_000;

const TEXT_COLUMNS = ['intern_number', 'domain', 'year'];

/** Columnas facetadas de valor directo (FK uuid o enum). `brand` y `model` son FK enteras (armado aparte). */
const FACET_COLUMN_MAP: Record<string, string> = { type: 'type', condition: 'condition', status: 'status' };
const INT_FK_COLUMNS = ['brand', 'model'] as const;

const ALLOWED_FILTER_PARAMS = new Set([
  ...TEXT_COLUMNS,
  ...Object.keys(FACET_COLUMN_MAP),
  ...INT_FK_COLUMNS,
  'is_active',
  ...dateRangeKeys(['affected_since']),
]);

const VALID_CONDITION = new Set<string>(Object.values(condition_enum));
const VALID_STATUS = new Set<string>(Object.values(status_type));

const SEARCH_FIELDS = ['intern_number', 'domain', 'year'] as const;

/** `is_active` queda afuera: los equipos dados de baja siempre van al final. */
const SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.vehiclesOrderByWithRelationInput[]> = {
  intern_number: (dir) => [{ intern_number: dir }],
  domain: (dir) => [{ domain: dir }],
  year: (dir) => [{ year: dir }],
  condition: (dir) => [{ condition: dir }],
  status: (dir) => [{ status: dir }],
  type: (dir) => [{ type_vehicles_typeTotype: { name: dir } }],
  brand: (dir) => [{ brand_vehicles: { name: dir } }],
  model: (dir) => [{ model_vehicles: { name: dir } }],
};

// ============================================================================
// SELECT
// ============================================================================

function equipmentListSelect(customerId: string) {
  return {
    id: true,
    intern_number: true,
    domain: true,
    year: true,
    condition: true,
    status: true,
    is_active: true,
    type_vehicles_typeTotype: { select: { id: true, name: true } },
    brand_vehicles: { select: { id: true, name: true } },
    model_vehicles: { select: { id: true, name: true } },
    // La afectación de ESTE cliente (la pivote es única por equipo + cliente).
    contractor_equipment: { where: { contractor_id: customerId }, select: { created_at: true }, take: 1 },
  } satisfies Prisma.vehiclesSelect;
}

type EquipmentListQueryRow = Prisma.vehiclesGetPayload<{ select: ReturnType<typeof equipmentListSelect> }>;

function serializeEquipment(row: EquipmentListQueryRow) {
  const { contractor_equipment, ...rest } = row;
  return { ...rest, affected_since: contractor_equipment[0]?.created_at ?? null };
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
      type: isUuid,
      condition: (value) => VALID_CONDITION.has(value),
      status: (value) => VALID_STATUS.has(value),
    }),
  };
}

function buildWhereClause(companyId: string, customerId: string, state: TableState): Prisma.vehiclesWhereInput {
  const AND: Prisma.vehiclesWhereInput[] = [
    { company_id: companyId },
    { contractor_equipment: { some: { contractor_id: customerId, customers: { company_id: companyId } } } },
  ];

  const term = state.search.trim();
  if (term) {
    AND.push({
      OR: SEARCH_FIELDS.map((field) => ({
        [field]: { contains: term, mode: 'insensitive' },
      })) as Prisma.vehiclesWhereInput[],
    });
  }

  AND.push(buildTextFiltersWhere(state.filters, TEXT_COLUMNS) as Prisma.vehiclesWhereInput);
  // Solo las columnas facetadas de valor directo: el resto de las claves tiene su armado propio.
  AND.push(
    buildFiltersWhere(
      Object.fromEntries(Object.entries(state.filters).filter(([key]) => key in FACET_COLUMN_MAP)),
      FACET_COLUMN_MAP
    ) as Prisma.vehiclesWhereInput
  );

  for (const column of INT_FK_COLUMNS) {
    const where = intFkFilterWhere(column, state.filters[column]);
    if (where) AND.push(where as Prisma.vehiclesWhereInput);
  }

  const active = booleanFilterWhere('is_active', state.filters.is_active);
  if (active) AND.push(active as Prisma.vehiclesWhereInput);

  const affectedRange = buildDateRangeFiltersWhere(state.filters, ['affected_since'], { affected_since: 'created_at' });
  if (Object.keys(affectedRange).length > 0) {
    AND.push({
      contractor_equipment: {
        some: { contractor_id: customerId, ...(affectedRange as Prisma.contractor_equipmentWhereInput) },
      },
    });
  }

  return { AND };
}

function buildOrderBy(state: TableState): Prisma.vehiclesOrderByWithRelationInput[] {
  const userSorts: Prisma.vehiclesOrderByWithRelationInput[] = [];
  for (const sort of state.sorting) {
    const resolve = SORT_MAP[sort.id];
    if (resolve) userSorts.push(...resolve(sort.desc ? 'desc' : 'asc'));
  }
  return [{ is_active: { sort: 'desc', nulls: 'last' } }, ...userSorts, { domain: 'asc' }, { id: 'asc' }];
}

async function canViewEquipment(): Promise<boolean> {
  return checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view');
}

// ============================================================================
// PAGINADA
// ============================================================================

/** Equipos de la empresa afectados a UN cliente, paginados en el servidor. */
export async function getCustomerEquipmentPaginated(customerId: string, searchParams: DataTableSearchParams) {
  if (!(await canViewEquipment())) throw new Error('No tenés permiso para ver los equipos del cliente');

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, customerId, state);

    const [rows, total] = await Promise.all([
      prisma.vehicles.findMany({
        where,
        orderBy: buildOrderBy(state),
        skip,
        take,
        select: equipmentListSelect(customerId),
      }),
      prisma.vehicles.count({ where }),
    ]);

    return { data: rows.map(serializeEquipment), total };
  } catch (error) {
    logger.error('Error al obtener los equipos del cliente', { data: { error, customerId } });
    throw new Error('No se pudieron cargar los equipos del cliente. Intente nuevamente.');
  }
}

export type CustomerEquipmentItem = Awaited<ReturnType<typeof getCustomerEquipmentPaginated>>['data'][number];

// ============================================================================
// EXPORT
// ============================================================================

export async function getAllCustomerEquipmentForExport(
  customerId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<CustomerEquipmentItem[]>> {
  if (!(await canViewEquipment())) return { ok: false, message: 'No tenés permiso para exportar los equipos' };

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const rows = await prisma.vehicles.findMany({
      where: buildWhereClause(companyId, customerId, state),
      orderBy: buildOrderBy(state),
      select: equipmentListSelect(customerId),
      take: EQUIPMENT_EXPORT_MAX_ROWS + 1,
    });

    if (rows.length > EQUIPMENT_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportTooLargeMessage(EQUIPMENT_EXPORT_MAX_ROWS, 'equipos') };
    }
    return { ok: true, data: rows.map(serializeEquipment) };
  } catch (error) {
    logger.error('Error al exportar los equipos del cliente', { data: { error, customerId } });
    return { ok: false, message: 'No se pudo exportar la lista de equipos. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS
// ============================================================================

type FacetOption = { value: string; label: string };

/** Faceta de UNA columna con cross-filter (los conteos excluyen el filtro propio). */
export async function getCustomerEquipmentSingleFacet(
  customerId: string,
  columnId: string,
  searchParams: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: FacetOption[] } | null> {
  if (!(await canViewEquipment())) return null;

  const companyId = await getActiveCompanyId();
  try {
    const state = sanitizeState(parseSearchParams(searchParams));
    const where = buildWhereClause(companyId, customerId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'condition': {
        const rows = await prisma.vehicles.groupBy({ by: ['condition'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.condition, count: row._count }))) };
      }
      case 'status': {
        const rows = await prisma.vehicles.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.status, count: row._count }))) };
      }
      case 'is_active': {
        const rows = await prisma.vehicles.groupBy({ by: ['is_active'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.is_active, count: row._count }))) };
      }
      case 'type': {
        const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: true });
        const types = await prisma.type.findMany({
          where: { id: { in: rows.map((row) => row.type) } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.type, count: row._count }))),
          resolvedOptions: types.map((t) => ({ value: t.id, label: t.name })),
        };
      }
      case 'brand': {
        const rows = await prisma.vehicles.groupBy({ by: ['brand'], where, _count: true });
        const ids = rows.flatMap((row) => (row.brand != null ? [row.brand] : []));
        const brands = await prisma.brand_vehicles.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(
            rows.map((row) => ({ key: row.brand == null ? null : String(row.brand), count: row._count }))
          ),
          resolvedOptions: brands.map((b) => ({ value: String(b.id), label: b.name ?? 'Marca sin nombre' })),
        };
      }
      case 'model': {
        const rows = await prisma.vehicles.groupBy({ by: ['model'], where, _count: true });
        const ids = rows.flatMap((row) => (row.model != null ? [row.model] : []));
        const models = await prisma.model_vehicles.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return {
          counts: toFacetMap(
            rows.map((row) => ({ key: row.model == null ? null : String(row.model), count: row._count }))
          ),
          resolvedOptions: models.map((m) => ({ value: String(m.id), label: m.name ?? 'Modelo sin nombre' })),
        };
      }
      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de equipos del cliente', { data: { error, customerId, columnId } });
    return null;
  }
}

// ============================================================================
// OPCIONES DEL MODAL DE AFECTACIÓN
// ============================================================================

/**
 * Equipos ACTIVOS de la empresa que se pueden afectar al cliente (consulta liviana, se pide al abrir el
 * modal). Los dados de baja no se ofrecen.
 */
export async function getAssignableEquipmentOptions() {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'update'))) {
    throw new Error('No tenés permiso para afectar equipos al cliente');
  }
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.vehicles.findMany({
      where: { company_id: companyId, is_active: true },
      select: {
        id: true,
        intern_number: true,
        domain: true,
        type_vehicles_typeTotype: { select: { name: true } },
      },
      orderBy: [{ intern_number: 'asc' }, { domain: 'asc' }],
    });
  } catch (error) {
    logger.error('Error al obtener los equipos asignables', { data: { error } });
    throw new Error('No se pudo cargar la lista de equipos');
  }
}
