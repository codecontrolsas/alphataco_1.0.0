import type { Prisma } from '@/generated/prisma/client';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';

/**
 * Armado de consultas compartido por los listados de vehículos (activos y dados de baja).
 *
 * Solo contiene lo que es IGUAL en ambos: el perímetro de la consulta en un único `AND`, la lista blanca de
 * filtros, el orden multi-columna y las facetas por columna. Lo que difiere (activo/baja, columnas de texto y de
 * fecha, filtros propios del listado activo) entra por `VehicleListConfig`.
 *
 * Los listados de equipamiento pueden reutilizar `createVehicleListQuery` pasando su propia configuración.
 */

// ============================================================================
// CONSTANTES COMPARTIDAS
// ============================================================================

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
export const VEHICLE_EXPORT_MAX_ROWS = 10_000;

/**
 * Mapping de columnId (URL) → campo real en Prisma.
 * Solo para columnas cuyo ID en la URL difiere del campo en la BD.
 */
export const VEHICLE_COLUMN_MAP: Record<string, string> = {
  type: 'type',
  sub_type: 'subType',
  owner: 'owner_id',
  sector: 'sector',
  cost_center: 'cost_center_id',
};

/** Filtros de FK entera (marca y modelo): se arman a mano porque `buildFiltersWhere` no convierte a número. */
const INT_FK_COLUMNS = ['brand', 'model'] as const;

/** Columnas que se resuelven a mano (no pasan por `buildFiltersWhere`). */
const MANUAL_FILTER_COLUMNS = [...INT_FK_COLUMNS, 'contractor_equipment'];

/**
 * Mapeo de columnId → orderBy de Prisma para columnas FK.
 * Las columnas directas usan `{ field: dir }`; las FK necesitan `{ relation: { campo: dir } }`.
 */
export const VEHICLE_FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  type: (dir) => ({ type_vehicles_typeTotype: { name: dir } }),
  sub_type: (dir) => ({ sub_type: { name: dir } }),
  brand: (dir) => ({ brand_vehicles: { name: dir } }),
  model: (dir) => ({ model_vehicles: { name: dir } }),
  owner: (dir) => ({ equipment_owners: { name: dir } }),
  sector: (dir) => ({ hierarchy: { name: dir } }),
  cost_center: (dir) => ({ cost_center: { name: dir } }),
  type_of_vehicle: (dir) => ({ types_of_vehicles: { name: dir } }),
  checklist_count: (dir) => ({ checklist_answers: { _count: dir } }),
};

/** `price` es Decimal: no se puede pasar a un Client Component. Se entrega como número. */
export function withNumericPrice<T extends { price: { toString(): string } | null }>(vehicle: T) {
  return { ...vehicle, price: vehicle.price === null ? null : Number(vehicle.price) };
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

export interface VehicleListConfig {
  /** `true` = listado activo, `false` = dados de baja. Va en el perímetro de la consulta. */
  isActive: boolean;
  /** Campos de la búsqueda global. */
  searchColumns: string[];
  /** Columnas de enum con filtro facetado (el id de la columna es el campo de Prisma). */
  enumColumns: string[];
  /** Columnas con filtro de texto libre. */
  textColumns: string[];
  /** Columnas `@db.Date`/timestamp con filtro de rango. */
  dateColumns: string[];
  /**
   * Filtros que solo existen en el listado activo: checklist (cantidad y fecha del último) y "posee certificación".
   * Son columnas virtuales o booleanas que se resuelven a mano.
   */
  withFleetExtras: boolean;
}

type ListState = ReturnType<typeof parseSearchParams>;

/** Perímetro de la consulta: empresa activa, estado activo/baja y solo "vehículos". */
function perimeter(companyId: string, isActive: boolean): Prisma.vehiclesWhereInput {
  return { company_id: companyId, is_active: isActive, type_of_vehicle: 1 };
}

/** Filtro por FK entera (marca/modelo) con soporte de "Sin asignar". */
function buildIntFkCondition(field: string, values: string[] | undefined): Prisma.vehiclesWhereInput | null {
  if (!values?.length) return null;
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values
    .filter((v) => v !== NULL_FILTER_VALUE)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (hasNull && ids.length > 0) return { OR: [{ [field]: { in: ids } }, { [field]: null }] };
  if (hasNull) return { [field]: null };
  return { [field]: { in: ids } };
}

/** Filtro por afectaciones (M:M con clientes) con soporte de "Sin afectar". */
function buildContractorCondition(values: string[] | undefined): Prisma.vehiclesWhereInput | null {
  if (!values?.length) return null;
  const hasNull = values.includes(NULL_FILTER_VALUE);
  const ids = values.filter((v) => v !== NULL_FILTER_VALUE);

  if (hasNull && ids.length > 0) {
    return {
      OR: [{ contractor_equipment: { some: { contractor_id: { in: ids } } } }, { contractor_equipment: { none: {} } }],
    };
  }
  if (hasNull) return { contractor_equipment: { none: {} } };
  return { contractor_equipment: { some: { contractor_id: { in: ids } } } };
}

/** Booleano NOT NULL: con ambos valores (o ninguno) no se filtra. */
function buildBooleanCondition(field: string, values: string[] | undefined): Prisma.vehiclesWhereInput | null {
  if (values?.length !== 1) return null;
  return { [field]: values[0] === 'true' };
}

/**
 * Filtro de rango sobre la fecha del último checklist (columna virtual): EXISTS sobre la relación, no un
 * campo escalar de vehicles.
 */
function buildLastChecklistDateCondition(state: ListState): Prisma.vehiclesWhereInput | null {
  const range = buildDateRangeFiltersWhere(state.filters, ['last_checklist_date']) as {
    last_checklist_date?: { gte?: Date; lte?: Date };
  };
  if (!range.last_checklist_date) return null;
  return { checklist_answers: { some: { created_at: range.last_checklist_date } } };
}

/**
 * Filtro de "cantidad de checklist" (columna virtual).
 * - 0 → vehículos sin ningún checklist (`checklist_answers: none`).
 * - N > 0 → vehículos con exactamente N, resuelto con `groupBy` + `having`. El `groupBy` se acota a los vehículos
 *   que ya cumplen el resto de las condiciones (el resultado final es la intersección, así que no cambia), en vez
 *   de recorrer los checklists de toda la flota.
 */
async function buildChecklistCountCondition(
  values: string[] | undefined,
  scope: Prisma.vehiclesWhereInput[]
): Promise<Prisma.vehiclesWhereInput | null> {
  const raw = values?.[0]?.trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;

  if (n === 0) return { checklist_answers: { none: {} } };

  const groups = await prisma.checklist_answers.groupBy({
    by: ['equipment_id'],
    where: { vehicles: { AND: scope } },
    _count: { equipment_id: true },
    having: { equipment_id: { _count: { equals: n } } },
  });

  return { id: { in: groups.map((g) => g.equipment_id) } };
}

// ============================================================================
// FACETAS
// ============================================================================

type FacetOutput = NonNullable<SingleFacetResult>;

function nameOptions(rows: { id: string | number; name: string | null }[]) {
  return rows.map((o) => ({ id: String(o.id), name: o.name }));
}

/** Facetas de las columnas que existen en los listados de vehículos. Devuelve `null` si la columna no es facetable. */
async function runVehicleFacet(columnId: string, where: Prisma.vehiclesWhereInput): Promise<FacetOutput | null> {
  switch (columnId) {
    // ── Enums ───────────────────────────────────────────────────────────────
    case 'condition': {
      const rows = await prisma.vehicles.groupBy({ by: ['condition'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.condition, count: r._count }))) };
    }
    case 'status': {
      const rows = await prisma.vehicles.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }
    case 'type_of_contract': {
      const rows = await prisma.vehicles.groupBy({ by: ['type_of_contract'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.type_of_contract, count: r._count }))) };
    }
    case 'cost_type': {
      const rows = await prisma.vehicles.groupBy({ by: ['cost_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.cost_type, count: r._count }))) };
    }
    case 'currency': {
      const rows = await prisma.vehicles.groupBy({ by: ['currency'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.currency, count: r._count }))) };
    }
    case 'reason_for_termination': {
      const rows = await prisma.vehicles.groupBy({ by: ['reason_for_termination'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.reason_for_termination, count: r._count }))) };
    }

    // ── Booleano ────────────────────────────────────────────────────────────
    case 'has_certification': {
      const rows = await prisma.vehicles.groupBy({ by: ['has_certification'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: String(r.has_certification), count: r._count }))) };
    }

    // ── FK UUID ─────────────────────────────────────────────────────────────
    case 'type': {
      const rows = await prisma.vehicles.groupBy({ by: ['type'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.type, count: r._count })));
      const ids = rows.map((r) => r.type).filter((id): id is string => id != null);
      const options = ids.length
        ? await prisma.type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }
    case 'sub_type': {
      const rows = await prisma.vehicles.groupBy({ by: ['subType'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.subType, count: r._count })));
      const ids = rows.map((r) => r.subType).filter((id): id is string => id != null);
      const options = ids.length
        ? await prisma.sub_type.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }
    case 'owner': {
      const rows = await prisma.vehicles.groupBy({ by: ['owner_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.owner_id, count: r._count })));
      const ids = rows.map((r) => r.owner_id).filter((id): id is string => id != null);
      const options = ids.length
        ? await prisma.equipment_owners.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }
    case 'sector': {
      const rows = await prisma.vehicles.groupBy({ by: ['sector'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.sector, count: r._count })));
      const ids = rows.map((r) => r.sector).filter((id): id is string => id != null);
      const options = ids.length
        ? await prisma.hierarchy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }
    case 'cost_center': {
      const rows = await prisma.vehicles.groupBy({ by: ['cost_center_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.cost_center_id, count: r._count })));
      const ids = rows.map((r) => r.cost_center_id).filter((id): id is string => id != null);
      const options = ids.length
        ? await prisma.cost_center.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }

    // ── FK entera ───────────────────────────────────────────────────────────
    case 'brand': {
      const rows = await prisma.vehicles.groupBy({ by: ['brand'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.brand == null ? null : String(r.brand), count: r._count })));
      const ids = rows.map((r) => r.brand).filter((id): id is number => id != null);
      const options = ids.length
        ? await prisma.brand_vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }
    case 'model': {
      const rows = await prisma.vehicles.groupBy({ by: ['model'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.model == null ? null : String(r.model), count: r._count })));
      const ids = rows.map((r) => r.model).filter((id): id is number => id != null);
      const options = ids.length
        ? await prisma.model_vehicles.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
      return { counts, resolvedOptions: nameOptions(options) };
    }

    // ── M:M con clientes ────────────────────────────────────────────────────
    case 'contractor_equipment': {
      const counts = new Map<string, number>();

      const [grouped, total, withContractor] = await Promise.all([
        prisma.contractor_equipment.groupBy({
          by: ['contractor_id'],
          where: { vehicles: where },
          _count: { _all: true },
        }),
        prisma.vehicles.count({ where }),
        prisma.vehicles.count({ where: { AND: [where, { contractor_equipment: { some: {} } }] } }),
      ]);

      for (const row of grouped) {
        if (row.contractor_id) counts.set(row.contractor_id, row._count._all);
      }

      const unassigned = total - withContractor;
      if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);

      const contractorIds = [...counts.keys()].filter((k) => k !== NULL_FILTER_VALUE);
      const contractors = contractorIds.length
        ? await prisma.customers.findMany({ where: { id: { in: contractorIds } }, select: { id: true, name: true } })
        : [];

      return { counts, resolvedOptions: nameOptions(contractors) };
    }

    default:
      return null;
  }
}

// ============================================================================
// FÁBRICA
// ============================================================================

/**
 * Crea las piezas de consulta de un listado de vehículos: estado parseado con lista blanca, `where` con el
 * perímetro dentro de un único `AND`, y faceta de una columna con cross-filter.
 */
export function createVehicleListQuery(config: VehicleListConfig) {
  const { isActive, searchColumns, enumColumns, textColumns, dateColumns, withFleetExtras } = config;

  const extraFilterKeys = withFleetExtras
    ? ['has_certification', 'checklist_count', ...dateRangeKeys(['last_checklist_date'])]
    : [];

  /** Únicas claves de URL que filtran la tabla: el resto (tab, subtab, company_id…) se descarta. */
  const allowedFilterKeys: ReadonlySet<string> = new Set([
    ...Object.keys(VEHICLE_COLUMN_MAP),
    ...enumColumns,
    ...MANUAL_FILTER_COLUMNS,
    ...textColumns,
    ...dateRangeKeys(dateColumns),
    ...extraFilterKeys,
  ]);

  /** Columnas con faceta: las de enum, las FK y (si corresponde) el booleano de certificación. */
  const facetColumns: ReadonlySet<string> = new Set([
    ...enumColumns,
    ...Object.keys(VEHICLE_COLUMN_MAP),
    ...MANUAL_FILTER_COLUMNS,
    ...(withFleetExtras ? ['has_certification'] : []),
  ]);

  /** Columnas que `buildFiltersWhere` NO debe tratar como igualdad directa. */
  const excludedFromGenericFilters = [
    ...textColumns,
    ...MANUAL_FILTER_COLUMNS,
    ...(withFleetExtras ? ['has_certification', 'checklist_count', 'last_checklist_date'] : []),
  ];

  /** Estado de la tabla ya parseado y con solo los filtros permitidos. */
  function parseState(searchParams: DataTableSearchParams | undefined): ListState {
    return sanitizeFilters(parseSearchParams(searchParams ?? {}), allowedFilterKeys);
  }

  /**
   * WHERE compartido por la lista paginada, el export y las facetas. Todo (perímetro, búsqueda y cada filtro)
   * va dentro de UN `AND`: ningún filtro puede pisar el perímetro ni a otro filtro.
   */
  async function buildWhere(companyId: string, state: ListState): Promise<Prisma.vehiclesWhereInput> {
    const conditions: Prisma.vehiclesWhereInput[] = [
      buildSearchWhere(state.search, searchColumns) as Prisma.vehiclesWhereInput,
      buildFiltersWhere(state.filters, VEHICLE_COLUMN_MAP, {
        exclude: excludedFromGenericFilters,
      }) as Prisma.vehiclesWhereInput,
      buildTextFiltersWhere(state.filters, textColumns) as Prisma.vehiclesWhereInput,
      buildDateRangeFiltersWhere(state.filters, dateColumns) as Prisma.vehiclesWhereInput,
    ];

    const optional: (Prisma.vehiclesWhereInput | null)[] = [
      ...INT_FK_COLUMNS.map((column) => buildIntFkCondition(column, state.filters[column])),
      buildContractorCondition(state.filters['contractor_equipment']),
    ];

    if (withFleetExtras) {
      optional.push(
        buildBooleanCondition('has_certification', state.filters['has_certification']),
        buildLastChecklistDateCondition(state)
      );
    }

    for (const condition of optional) if (condition) conditions.push(condition);

    const scope = [perimeter(companyId, isActive), ...conditions];

    if (withFleetExtras) {
      const checklistCount = await buildChecklistCountCondition(state.filters['checklist_count'], scope);
      if (checklistCount) scope.push(checklistCount);
    }

    return { AND: scope };
  }

  /** Faceta de UNA columna con cross-filter (sin el filtro propio). `null` si la columna no es facetable. */
  async function getFacet(
    companyId: string,
    columnId: string,
    searchParams: DataTableSearchParams | undefined
  ): Promise<FacetOutput | null> {
    if (!facetColumns.has(columnId)) return null;
    const state = withoutOwnFilter(parseState(searchParams), columnId);
    const where = await buildWhere(companyId, state);
    return runVehicleFacet(columnId, where);
  }

  return { parseState, buildWhere, getFacet };
}

/**
 * Orden multi-columna: solo campos de la lista blanca, FK resueltas con `VEHICLE_FK_SORT_MAP`, y el desempate
 * por defecto al final.
 */
export function resolveVehicleOrderBy(
  sorting: ReadonlyArray<{ id: string; desc: boolean }>,
  validSortFields: ReadonlySet<string>,
  fallback: Record<string, 'asc' | 'desc'>[]
) {
  const resolved: Record<string, unknown>[] = [];
  for (const s of sorting) {
    if (!validSortFields.has(s.id)) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const fkMapper = VEHICLE_FK_SORT_MAP[s.id];
    resolved.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
  }
  return [...resolved, ...fallback];
}
