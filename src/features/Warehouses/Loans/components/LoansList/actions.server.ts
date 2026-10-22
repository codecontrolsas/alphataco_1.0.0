'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { destinationSearchConditions } from '@/features/Warehouses/lib/destination-search';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { exportFailure, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { LOAN_UNIT_SELECT, openLoansWhere, staleLoansWhere, toLoan } from '../../../lib/loans';

const logger = new Logger('features/Warehouses/Loans/LoansList');

type UnitWhere = Prisma.material_unitsWhereInput;
type MovementWhere = Prisma.stock_movementsWhereInput;
type UnitOrderBy = Prisma.material_unitsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Filas = unidades serializadas en estado `OUT` (prestamos abiertos).
 *
 * Ordenables server-side: serie, codigo, material, tipo de destino, y `since`/`days`
 * (ambos salen de `last_movement.occurred_on`; `days` invierte la direccion). Para una
 * anulacion de devolucion la fecha mostrada sale de `returned_from`, asi que el orden por
 * fecha es aproximado en ese caso puntual. NO ordenables: `holder` (calculado desde varias
 * relaciones del destino) y `exit` (el numero mostrado puede venir de `returned_from`).
 */
const VALID_SORT_FIELDS = new Set(['serial_number']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => UnitOrderBy> = {
  material_code: (dir) => ({ material: { code: dir } }),
  material: (dir) => ({ material: { name: dir } }),
  destination_type: (dir) => ({ last_movement: { destination_type: dir } }),
  since: (dir) => ({ last_movement: { occurred_on: dir } }),
  // Mas dias en prestamo = fecha de salida mas vieja
  days: (dir) => ({ last_movement: { occurred_on: dir === 'asc' ? 'desc' : 'asc' } }),
};

/** Unica columna faceted: se aplica sobre `last_movement`. */
const FACETED_COLUMNS = ['destination_type'] as const;

/** Filtros que acepta la tabla; cualquier otra clave de la URL se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS = new Set<string>([
  ...FACETED_COLUMNS,
  'serial_number',
  'material_code',
  'material',
  'holder',
  'exit',
  'days',
  ...dateRangeKeys(['since']),
]);

/** Estado de la tabla ya parseado y con solo los filtros permitidos. */
function parseListState(searchParams: DataTableSearchParams) {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/** Orden por defecto: los prestamos mas viejos primero. */
const DEFAULT_ORDER: UnitOrderBy[] = [{ last_movement: { occurred_on: 'asc' } }, { id: 'asc' }];

const DAY_MS = 86_400_000;

/** Tope de filas por export. */
const EXPORT_MAX_LOANS = 10_000;

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** Condicion sobre la fecha de la SALIDA (misma regla que `toLoan`: la salida o `returned_from`). */
function exitDateWhere(range: Record<string, unknown>): UnitWhere {
  return {
    OR: [
      { last_movement: { AND: [{ type: 'EXIT' }, range as MovementWhere] } },
      { last_movement: { returned_from: { is: range as MovementWhere } } },
    ],
  };
}

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: FilterState): UnitWhere {
  const f = state.filters;
  // Base compartida con el contador de la sub-navegacion y la banda: prestamos abiertos (sin cubiertas).
  const and: UnitWhere[] = [openLoansWhere(companyId)];

  // Busqueda global: serie, codigo y nombre del material
  const search = state.search?.trim();
  if (search) {
    and.push({
      OR: [
        buildSearchWhere(search, ['serial_number']) as UnitWhere,
        { material: { OR: [{ code: contains(search) }, { name: contains(search) }] } },
      ],
    });
  }

  // Tipo de destino (faceted, con "Sin asignar")
  const faceted = buildFiltersWhere(
    Object.fromEntries(FACETED_COLUMNS.filter((c) => f[c]).map((c) => [c, f[c]]))
  ) as MovementWhere;
  if (Object.keys(faceted).length > 0) and.push({ last_movement: faceted });

  // Textos
  const serial = f.serial_number?.[0]?.trim();
  if (serial) and.push({ serial_number: contains(serial) });
  const code = f.material_code?.[0]?.trim();
  if (code) and.push({ material: { code: contains(code) } });
  const materialName = f.material?.[0]?.trim();
  if (materialName) and.push({ material: { name: contains(materialName) } });

  // Tenedor: mismo criterio que el filtro `destination` de Movimientos
  const holder = f.holder?.[0]?.trim();
  if (holder) {
    and.push({
      last_movement: {
        OR: destinationSearchConditions(holder),
      },
    });
  }

  // Numero de la salida (el mostrado: la salida o `returned_from`)
  const exitNumber = f.exit?.[0]?.trim();
  if (exitNumber) and.push(exitDateWhere({ number: contains(exitNumber) }));

  // Desde (rango de fechas de la salida)
  const since = buildDateRangeFiltersWhere(f, ['since'], { since: 'occurred_on' });
  if (Object.keys(since).length > 0) and.push(exitDateWhere(since));

  // Dias en prestamo: numero exacto -> fecha de salida = hoy - N dias
  const daysRaw = f.days?.[0]?.trim();
  if (daysRaw) {
    const n = Number(daysRaw);
    if (Number.isInteger(n) && n >= 0) {
      const ymd = new Date(Date.parse(`${argentinaDate()}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
      and.push(exitDateWhere({ occurred_on: new Date(`${ymd}T00:00:00Z`) }));
    } else {
      and.push({ id: { in: [] } }); // texto no numerico: sin resultados
    }
  }

  return { AND: and };
}

function shape(rows: Prisma.material_unitsGetPayload<{ select: typeof LOAN_UNIT_SELECT }>[]) {
  const today = argentinaDate();
  return rows.map((r) => {
    const loan = toLoan(r, today);
    return { id: loan.unitId, ...loan };
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getLoansPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'view'))) return { data: [], total: 0 };
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: UnitOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    // Por defecto: los prestamos mas viejos primero
    const orderBy: UnitOrderBy[] = [...resolvedSorts, ...DEFAULT_ORDER];

    const [rows, total] = await Promise.all([
      prisma.material_units.findMany({ where, orderBy, skip, take, select: LOAN_UNIT_SELECT }),
      prisma.material_units.count({ where }),
    ]);
    return { data: shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener prestamos', { data: { error } });
    throw new Error('No se pudo obtener la lista de préstamos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllLoansForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<Awaited<ReturnType<typeof getLoansPaginated>>['data']>> {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'view'))) return { ok: true, data: [] };
  const companyId = await getActiveCompanyId();

  try {
    const state = parseListState(searchParams);
    const where = buildWhereClause(companyId, state);
    const rows = await fetchExportRowsInBatches({
      listIds: (take) => prisma.material_units.findMany({ where, orderBy: DEFAULT_ORDER, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.material_units.findMany({
          where: { AND: [openLoansWhere(companyId), { id: { in: ids } }] },
          select: LOAN_UNIT_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} préstamos con los filtros actuales. Acote la exportación con filtros.`,
      maxRows: EXPORT_MAX_LOANS,
    });
    return { ok: true, data: shape(rows) };
  } catch (error) {
    logger.error('Error al exportar prestamos', { data: { error } });
    return exportFailure(error, 'No se pudo exportar la lista de préstamos. Intente nuevamente.');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getLoanSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number> } | null> {
  if (!(await checkPermissionServer('almacenes', 'prestamos', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseListState(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): UnitWhere {
    const base: FilterState = parsed ?? parseListState({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId, { ...base, filters });
  }

  try {
    if (columnId === 'destination_type') {
      // Prisma no agrupa por un campo de relacion: se cuentan unidades (los prestamos abiertos
      // son pocos) agrupando el destino de su ultimo movimiento.
      const rows = await prisma.material_units.findMany({
        where: crossWhere(columnId),
        select: { last_movement: { select: { destination_type: true } } },
      });
      const counts = new Map<string, number>();
      for (const r of rows) {
        const key = r.last_movement?.destination_type ?? NULL_FILTER_VALUE;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return { counts };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de prestamos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// ATENCION (banda sobre la tabla)
// ============================================================================

/**
 * Prestamos abiertos (la misma condicion que la lista y el contador de la sub-navegacion) y el mas
 * antiguo. El modelo no tiene fecha de devolucion prevista ni umbral definido: no se informa "vencidos".
 * Nunca rechaza: devuelve `null` si no se pudo calcular (la banda no se muestra).
 */
export async function getLoansAttention(): Promise<{
  open: number;
  /** Abiertos con `STALE_LOAN_DAYS` dias o mas desde la salida (`staleLoansWhere`). */
  stale: number;
  oldest: { since: string; days: number | null; serialNumber: string } | null;
} | null> {
  try {
    if (!(await checkPermissionServer('almacenes', 'prestamos', 'view'))) return null;
    const companyId = await getActiveCompanyId();
    const today = argentinaDate();
    const where = openLoansWhere(companyId);
    const [open, stale, first] = await Promise.all([
      prisma.material_units.count({ where }),
      prisma.material_units.count({ where: staleLoansWhere(companyId, today) }),
      prisma.material_units.findFirst({ where, orderBy: DEFAULT_ORDER, select: LOAN_UNIT_SELECT }),
    ]);
    const loan = first ? toLoan(first, today) : null;
    return {
      open,
      stale,
      oldest: loan?.since ? { since: loan.since, days: loan.days, serialNumber: loan.serialNumber } : null,
    };
  } catch (error) {
    logger.error('Error al contar prestamos abiertos', { data: { error } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type LoanListItem = Awaited<ReturnType<typeof getLoansPaginated>>['data'][number];
