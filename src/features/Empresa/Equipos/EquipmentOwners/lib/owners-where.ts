import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { condition_enum, status_type } from '@/generated/prisma/enums';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { buildIsActiveWhere } from '../../../lib/catalog-table.server';
import { catalogReadScope } from '../../lib/catalog-scope';

// ============================================================================
// TITULARES (equipment_owners)
// ============================================================================

/** Campos reales de BD por los que se puede ordenar la tabla de titulares. */
export const VALID_SORT_FIELDS = new Set(['name', 'cuit', 'is_active', 'created_at']);

/** Claves de filtro que la tabla de titulares realmente usa; el resto de la URL se descarta antes de armar el where. */
const OWNER_FILTER_KEYS = new Set(['is_active', 'name', 'cuit', ...dateRangeKeys(['created_at'])]);

export function parseOwnersState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), OWNER_FILTER_KEYS);
}

/** Mismo where para lista, export y facets de titulares. Los filtros con OR van en AND para que no se pisen. */
export function buildWhereClause(state: ReturnType<typeof parseOwnersState>, companyId: string) {
  return {
    AND: [
      buildSearchWhere(state.search, ['name', 'cuit']),
      buildIsActiveWhere(state.filters['is_active']),
      buildTextFiltersWhere(state.filters, ['name', 'cuit']),
      buildDateRangeFiltersWhere(state.filters, ['created_at']),
      catalogReadScope(companyId),
    ],
  };
}

export const OWNER_LIST_SELECT = {
  id: true,
  name: true,
  cuit: true,
  is_active: true,
  created_at: true,
  equipment_owner_contract_types: { select: { id: true, contract_type: true } },
} as const;

// ============================================================================
// EQUIPOS POR TITULAR (vehicles)
// ============================================================================

export const VEHICLE_VALID_SORT_FIELDS = new Set([
  'domain',
  'chassis',
  'engine',
  'serie',
  'intern_number',
  'year',
  'condition',
  'status',
  'kilometer',
  'engine_hours',
  'created_at',
]);

export const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  subType: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
};

const VEHICLE_TEXT_COLUMNS = ['domain', 'intern_number', 'serie', 'engine', 'chassis'];

/** Claves de filtro que la tabla de equipos por titular realmente usa. */
const VEHICLE_FILTER_KEYS = new Set([
  'is_active',
  'condition',
  'status',
  'type',
  'subType',
  'created_at',
  ...VEHICLE_TEXT_COLUMNS,
]);

export function parseVehiclesState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), VEHICLE_FILTER_KEYS);
}

/** Mismo where para lista, export y facets de equipos de un titular. */
export function buildVehicleWhereClause(
  ownerId: string,
  state: ReturnType<typeof parseVehiclesState>,
  companyId: string
): Prisma.vehiclesWhereInput {
  const AND: Prisma.vehiclesWhereInput[] = [{ owner_id: ownerId }];

  // ── Búsqueda global (domain, intern_number, serie, engine, chassis) ────────
  if (state.search) {
    AND.push({
      OR: VEHICLE_TEXT_COLUMNS.map((f) => ({
        [f]: { contains: state.search, mode: 'insensitive' as const },
      })),
    });
  }

  // ── is_active (booleano nullable) ─────────────────────────────────────────
  const isActiveValues = state.filters['is_active'];
  if (isActiveValues?.length) {
    const hasNull = isActiveValues.includes(NULL_FILTER_VALUE);
    const trueVal = isActiveValues.includes('true');
    const falseVal = isActiveValues.includes('false');
    const orConds: Prisma.vehiclesWhereInput[] = [];
    if (hasNull) orConds.push({ is_active: null });
    if (trueVal) orConds.push({ is_active: true });
    if (falseVal) orConds.push({ is_active: false });
    if (orConds.length === 1) AND.push(orConds[0]);
    else if (orConds.length > 1) AND.push({ OR: orConds });
  }

  // ── condition (enum nullable) ─────────────────────────────────────────────
  const conditionValues = state.filters['condition'];
  if (conditionValues?.length) {
    const hasNull = conditionValues.includes(NULL_FILTER_VALUE);
    const realValues = conditionValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .filter((v): v is condition_enum => Object.values(condition_enum).includes(v as condition_enum));
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ condition: null }, { condition: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ condition: null });
    } else if (realValues.length > 0) {
      AND.push({ condition: { in: realValues } });
    }
  }

  // ── status (enum nullable) ────────────────────────────────────────────────
  const statusValues = state.filters['status'];
  if (statusValues?.length) {
    const hasNull = statusValues.includes(NULL_FILTER_VALUE);
    const realValues = statusValues
      .filter((v) => v !== NULL_FILTER_VALUE)
      .filter((v): v is status_type => Object.values(status_type).includes(v as status_type));
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ status: null }, { status: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ status: null });
    } else if (realValues.length > 0) {
      AND.push({ status: { in: realValues } });
    }
  }

  // ── type (FK UUID — NOT nullable in schema) ───────────────────────────────
  const typeValues = state.filters['type'];
  if (typeValues?.length) {
    // type is NOT NULL in vehicles schema — ignore NULL_FILTER_VALUE
    const realValues = typeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (realValues.length > 0) {
      AND.push({ type: { in: realValues } });
    }
  }

  // ── subType (FK UUID nullable) ────────────────────────────────────────────
  const subTypeValues = state.filters['subType'];
  if (subTypeValues?.length) {
    const hasNull = subTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = subTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      AND.push({ OR: [{ subType: null }, { subType: { in: realValues } }] });
    } else if (hasNull) {
      AND.push({ subType: null });
    } else if (realValues.length > 0) {
      AND.push({ subType: { in: realValues } });
    }
  }

  // ── Filtros de texto libre por columna ────────────────────────────────────
  for (const col of VEHICLE_TEXT_COLUMNS) {
    const val = state.filters[col];
    if (val?.length === 1 && val[0]) {
      AND.push({ [col]: { contains: val[0], mode: 'insensitive' as const } });
    }
  }

  // ── Filtros de rango de fecha ─────────────────────────────────────────────
  const createdAtValues = state.filters['created_at'];
  if (createdAtValues?.length === 2) {
    const [from, to] = createdAtValues;
    if (from || to) {
      const dateFilter: Prisma.vehiclesWhereInput = {};
      if (from) dateFilter.created_at = { ...((dateFilter.created_at as object) ?? {}), gte: new Date(from) };
      if (to) dateFilter.created_at = { ...((dateFilter.created_at as object) ?? {}), lte: new Date(to) };
      AND.push(dateFilter);
    }
  }

  return withCompany({ AND }, companyId);
}

/** Campos de la lista de equipos de un titular (lista y export). */
export const VEHICLE_LIST_SELECT = {
  id: true,
  domain: true,
  chassis: true,
  engine: true,
  serie: true,
  intern_number: true,
  year: true,
  condition: true,
  status: true,
  kilometer: true,
  engine_hours: true,
  picture: true,
  is_active: true,
  created_at: true,
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { id: true, name: true } },
  model_vehicles: { select: { id: true, name: true } },
  contractor_equipment: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
} as const;
