import type { Prisma } from '@/generated/prisma/client';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, SortItem } from '@/shared/components/common/DataTable/types';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';

/**
 * Armado de `where`, orden y estado de las dos listas de otros equipos (activos y dados de baja).
 * Las dos tablas comparten el modelo `other_equipment` y difieren solo en `is_active` y en qué columnas
 * filtran, que entran por `OtherEquipmentListConfig`. Sin directiva `'use server'`: son funciones puras.
 */

/** Enums de `other_equipment` que se filtran (el id de columna es también el campo de Prisma). */
export type OtherEquipmentEnumField =
  | 'condition'
  | 'status'
  | 'cost_type'
  | 'currency'
  | 'type_of_contract'
  | 'reason_for_termination';

export interface OtherEquipmentListConfig {
  /** `true` = listado de activos, `false` = dados de baja. */
  isActive: boolean;
  enumColumns: readonly OtherEquipmentEnumField[];
  /** Texto libre: `contains` insensible a mayúsculas. */
  textColumns: readonly string[];
  /** Columnas Decimal: `contains` no existe para Decimal, se filtra por igualdad numérica. */
  decimalColumns: readonly string[];
  dateColumns: readonly string[];
  /** Booleanos NOT NULL (sin opción "Sin asignar"). */
  booleanColumns: readonly string[];
  /** Campos ordenables server-side (los FK se resuelven con `OTHER_EQUIPMENT_FK_SORT_MAP`). */
  validSortFields: ReadonlySet<string>;
}

/** Campos por los que busca el buscador global de la tabla. */
const SEARCH_FIELDS = ['serial_number', 'intern_number', 'manufacturer_plate'];

/** columnId (URL) → campo real, solo donde difieren. `brand`/`model` (Int) y el M:M se arman a mano. */
export const OTHER_EQUIPMENT_COLUMN_MAP: Record<string, string> = {
  type: 'type_id',
  sub_type: 'sub_type_id',
  brand: 'brand_id',
  model: 'model_id',
  sector: 'sector',
  owner: 'owner_id',
  cost_center: 'cost_center_id',
  linked_vehicle: 'linked_vehicle_id',
};

/** Orden de las columnas FK: se ordena por el nombre de la relación, no por el id. */
export const OTHER_EQUIPMENT_FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type: { name: dir } }),
  sub_type: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
  linked_vehicle: (dir) => ({ vehicles: { domain: dir } }),
  owner: (dir) => ({ equipment_owners: { name: dir } }),
  sector: (dir) => ({ hierarchy: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
};

const MANUAL_COLUMNS = ['brand', 'model', 'contractor_other_equipment'];

/** Únicas claves de la URL que filtran la tabla: el resto (`tab`, `company_id`, etc.) se descarta. */
function allowedFilterKeys(config: OtherEquipmentListConfig): Set<string> {
  return new Set([
    ...config.enumColumns,
    ...Object.keys(OTHER_EQUIPMENT_COLUMN_MAP),
    'contractor_other_equipment',
    ...config.textColumns,
    ...config.decimalColumns,
    ...config.booleanColumns,
    ...dateRangeKeys(config.dateColumns),
  ]);
}

/** Estado de la tabla ya parseado y con solo los filtros permitidos. */
export function parseOtherEquipmentState(
  searchParams: DataTableSearchParams | undefined,
  config: OtherEquipmentListConfig
) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), allowedFilterKeys(config));
}

export type OtherEquipmentListState = ReturnType<typeof parseOtherEquipmentState>;

/** Copia del estado sin el filtro de `columnId` (y su rango de fechas): base del filtro cruzado de las facetas. */
export function withoutColumnFilter(state: OtherEquipmentListState, columnId: string): OtherEquipmentListState {
  const filters = { ...state.filters };
  delete filters[columnId];
  delete filters[`${columnId}_from`];
  delete filters[`${columnId}_to`];
  return { ...state, filters };
}

/** Filtro por ids enteros (marca/modelo) con soporte de "Sin asignar". */
function intFkCondition(field: string, values: string[]): Prisma.other_equipmentWhereInput | null {
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values
    .filter((v) => v !== NULL_FILTER_VALUE)
    .map(Number)
    .filter((n) => Number.isInteger(n));
  const condition: Record<string, unknown> | null =
    hasNull && ids.length > 0
      ? { OR: [{ [field]: { in: ids } }, { [field]: null }] }
      : hasNull
        ? { [field]: null }
        : ids.length > 0
          ? { [field]: { in: ids } }
          : null;
  return condition as Prisma.other_equipmentWhereInput | null;
}

/** Filtro M:M "Afectado a" con soporte de "Sin afectar". */
function contractorCondition(values: string[]): Prisma.other_equipmentWhereInput | null {
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values.filter((v) => v !== NULL_FILTER_VALUE);
  const some = { contractor_other_equipment: { some: { contractor_id: { in: ids } } } };
  const none = { contractor_other_equipment: { none: {} } };
  if (hasNull && ids.length > 0) return { OR: [some, none] };
  if (hasNull) return none;
  if (ids.length > 0) return some;
  return null;
}

/**
 * WHERE compartido por la consulta paginada, el export y las facetas. TODO va dentro de un único `AND`:
 * el perímetro (empresa + `is_active`) no se puede pisar con un filtro, y los `AND` internos de
 * `buildFiltersWhere` ("Sin asignar" + valores) no se sobrescriben entre sí.
 */
export function buildOtherEquipmentWhere(
  companyId: string,
  state: OtherEquipmentListState,
  config: OtherEquipmentListConfig
): Prisma.other_equipmentWhereInput {
  const { filters } = state;
  const asWhere = (value: Record<string, unknown>) => value as Prisma.other_equipmentWhereInput;

  const filtersWhere = buildFiltersWhere(filters, OTHER_EQUIPMENT_COLUMN_MAP, {
    exclude: [
      ...MANUAL_COLUMNS,
      ...config.textColumns,
      ...config.decimalColumns,
      ...config.booleanColumns,
      ...dateRangeKeys(config.dateColumns),
    ],
  });

  // Decimal (horómetro, valor inicial): igualdad numérica; un texto no numérico no filtra.
  const decimalWhere: Record<string, unknown> = {};
  for (const column of config.decimalColumns) {
    const raw = filters[column]?.[0]?.trim().replace(',', '.');
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value)) decimalWhere[column] = { equals: value };
  }

  const extra: Prisma.other_equipmentWhereInput[] = [];
  for (const [columnId, field] of [
    ['brand', 'brand_id'],
    ['model', 'model_id'],
  ] as const) {
    const values = filters[columnId];
    const condition = values?.length ? intFkCondition(field, values) : null;
    if (condition) extra.push(condition);
  }

  const contractors = filters['contractor_other_equipment'];
  const contractorFilter = contractors?.length ? contractorCondition(contractors) : null;
  if (contractorFilter) extra.push(contractorFilter);

  // Booleanos: con ambos valores (o ninguno) no se filtra.
  for (const column of config.booleanColumns) {
    const values = filters[column];
    if (values?.length === 1) extra.push({ [column]: values[0] === 'true' } as Prisma.other_equipmentWhereInput);
  }

  return {
    AND: [
      { company_id: companyId },
      { is_active: config.isActive },
      asWhere(buildSearchWhere(state.search, SEARCH_FIELDS)),
      asWhere(filtersWhere),
      asWhere(buildTextFiltersWhere(filters, [...config.textColumns])),
      asWhere(decimalWhere),
      asWhere(buildDateRangeFiltersWhere(filters, [...config.dateColumns])),
      ...extra,
    ],
  };
}

/** Orden multi-columna: solo campos válidos; las columnas FK se resuelven por el nombre de la relación. */
export function buildOtherEquipmentOrderBy(
  sorting: SortItem[],
  validFields: ReadonlySet<string>
): Record<string, unknown>[] {
  const resolved: Record<string, unknown>[] = [];
  for (const sort of sorting) {
    if (!validFields.has(sort.id)) continue;
    const dir: 'asc' | 'desc' = sort.desc ? 'desc' : 'asc';
    const fkMapper = OTHER_EQUIPMENT_FK_SORT_MAP[sort.id];
    resolved.push(fkMapper ? fkMapper(dir) : { [sort.id]: dir });
  }
  return resolved;
}
