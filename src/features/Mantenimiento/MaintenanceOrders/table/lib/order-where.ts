import 'server-only';

import {
  NULL_FILTER_VALUE,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { withoutOwnFilter } from '@/shared/lib/table-facets';
import { visibleEquipmentTypeCondition } from '../../../shared/maintenance-resource';
import { computeCurrentSector, type CurrentSectorItemLike } from '../../utils/currentSector';
import { buildInWorkshopAttentionCondition, isInWorkshopAttentionKey } from './order-attention';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Columnas con filtro de texto libre en vehicles */
const VEHICLE_TEXT_FILTER_COLUMNS = ['domain', 'serie', 'intern_number'] as const;

/** Columnas con filtro de texto libre en la tabla principal */
const TEXT_FILTER_COLUMNS = ['order_number', 'description'];

/** Columnas con filtro de rango de fechas (ambas son timestamptz) */
const DATE_RANGE_COLUMNS = ['workshop_entry_date', 'created_at'] as const;

/** Lista blanca: cualquier otra clave de la URL (`company_id`, `tab`, …) se descarta antes de armar el where */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  'status',
  'vehicle',
  'currentSector',
  // Filtro virtual de las tarjetas de métricas (sin columna): ver `order-attention`
  'attention',
  ...VEHICLE_TEXT_FILTER_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/**
 * Estados que se muestran por defecto en el paso "En Taller".
 *
 * Ticket 595: las órdenes completadas salen del listado — el paso es de trabajo
 * activo. Siguen siendo alcanzables filtrando explícitamente por "Completada",
 * y el filtro conserva su contador gracias a `includeCompleted`.
 */
const ACTIVE_WORKSHOP_STATUSES = [
  'in_workshop',
  // Sin `pending_operations_validation`: Operaciones ya no valida (reunion 31/08/2026)
  'operations_rejected',
  'workshop_rejected',
];

export type OrderListState = ReturnType<typeof parseSearchParams>;

export interface OrderWhereContext {
  companyId: string;
  hiddenTypeIds: readonly string[];
}

// ============================================================================
// HELPERS
// ============================================================================

/** Día `YYYY-MM-DD` de un valor de filtro de fecha, o null si no es válido. */
function dayOf(value: string | undefined): string | null {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Rango de fechas sobre un timestamptz, tomando los bordes del día en hora argentina
 * (el helper genérico usa UTC y correría 3 h el corte de cada día).
 */
function argentinaRangeConditions(filters: Record<string, string[]>): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [];
  for (const column of DATE_RANGE_COLUMNS) {
    const from = dayOf(filters[`${column}_from`]?.[0]);
    const to = dayOf(filters[`${column}_to`]?.[0]);
    if (!from && !to) continue;
    conditions.push({
      [column]: {
        ...(from ? { gte: new Date(`${from}T00:00:00-03:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999-03:00`) } : {}),
      },
    });
  }
  return conditions;
}

/**
 * Sector actual (ticket 675): NO es un campo de BD, se calcula por orden a
 * partir de sus `maintenance_order_items` (ver `computeCurrentSector`). Como
 * no es filtrable directamente con Prisma, se resuelve en dos pasos:
 * 1. Se buscan las órdenes que cumplen el resto de los filtros (sin el de sector).
 * 2. Se calcula el sector actual de cada una en JS y se filtra por el/los
 *    sector(es) seleccionados, devolviendo los IDs que matchean.
 */
export async function getOrdersWithCurrentSector(where: Record<string, unknown>) {
  const rows = await prisma.maintenance_orders.findMany({
    where,
    select: {
      id: true,
      maintenance_order_items: {
        select: {
          assigned_sector_id: true,
          sector_sequence_order: true,
          workshop_sectors: { select: { id: true, name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sector: computeCurrentSector(row.maintenance_order_items as CurrentSectorItemLike[]),
  }));
}

async function resolveCurrentSectorOrderIds(
  baseWhereWithoutSector: Record<string, unknown>,
  sectorValues: string[]
): Promise<string[]> {
  const hasNull = sectorValues.includes(NULL_FILTER_VALUE);
  const realValues = sectorValues.filter((v) => v !== NULL_FILTER_VALUE);

  const orders = await getOrdersWithCurrentSector(baseWhereWithoutSector);

  return orders
    .filter((o) => (o.sector == null ? hasNull : realValues.includes(o.sector.id)))
    .map((o) => o.id);
}

// ============================================================================
// WHERE
// ============================================================================

/**
 * WHERE de `maintenance_orders` compartido por listado, facets y export de tareas.
 *
 * Todo va dentro de un único `AND` con la empresa primero, así ningún filtro de la URL ni el `OR` de la
 * búsqueda puede pisar el perímetro. `excludeColumn` quita el filtro propio de una faceta (cross-filter).
 */
export async function buildOrdersWhere(
  rawState: OrderListState,
  { companyId, hiddenTypeIds }: OrderWhereContext,
  options?: { excludeColumn?: string; includeCompleted?: boolean }
): Promise<{ AND: Record<string, unknown>[] }> {
  const excludeColumn = options?.excludeColumn;
  const sanitized = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);
  const state = excludeColumn ? withoutOwnFilter(sanitized, excludeColumn) : sanitized;
  const filters = state.filters;

  const and: Record<string, unknown>[] = [{ company_id: companyId }];

  const searchWhere = buildSearchWhere(state.search, ['order_number']);
  if (Object.keys(searchWhere).length > 0) and.push(searchWhere);

  const textWhere = buildTextFiltersWhere(filters, TEXT_FILTER_COLUMNS);
  if (Object.keys(textWhere).length > 0) and.push(textWhere);

  and.push(...argentinaRangeConditions(filters));

  // ─── Estado (enum directo; nunca es null en la práctica, se soporta el patrón) ───
  const statusValues = filters['status'];
  if (statusValues?.length) {
    const hasNull = statusValues.includes(NULL_FILTER_VALUE);
    const realValues = statusValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      and.push({ OR: [{ status: { in: realValues } }, { status: null }] });
    } else if (hasNull) {
      and.push({ status: null });
    } else {
      and.push({ status: { in: realValues } });
    }
  } else {
    // Sin filtro de estado: solo las órdenes relevantes de taller (excluye scheduled/pending_scheduling)
    and.push({
      status: { in: options?.includeCompleted ? [...ACTIVE_WORKSHOP_STATUSES, 'completed'] : ACTIVE_WORKSHOP_STATUSES },
    });
  }

  // ─── Equipo: la opción es el id del vehículo o del equipamiento ─────────────
  const resourceValues = filters['vehicle'];
  if (resourceValues?.length) {
    const hasNull = resourceValues.includes(NULL_FILTER_VALUE);
    const realValues = resourceValues.filter((v) => v !== NULL_FILTER_VALUE);
    const alternatives: Record<string, unknown>[] = [];
    if (realValues.length > 0) {
      alternatives.push({ equipment_id: { in: realValues } }, { other_equipment_id: { in: realValues } });
    }
    if (hasNull) alternatives.push({ equipment_id: null, other_equipment_id: null });
    and.push({ OR: alternatives });
  }

  // ─── Texto libre sobre el vehículo (dominio, serie, N° interno) ─────────────
  for (const column of VEHICLE_TEXT_FILTER_COLUMNS) {
    const value = filters[column]?.[0];
    if (value) and.push({ vehicles: { [column]: { contains: value, mode: 'insensitive' } } });
  }

  // Tipos de equipamiento ocultos para el usuario actual (ticket 690)
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
  if (equipmentCondition) and.push(equipmentCondition);

  // ─── Atención (virtual): la MISMA condición que cuenta la tarjeta de métricas ──────────────────
  const attentionValue = filters['attention']?.[0];
  if (isInWorkshopAttentionKey(attentionValue)) and.push(buildInWorkshopAttentionCondition(attentionValue));

  // ─── Sector actual (calculado — ticket 675) ─────────────────────────────────
  // Se resuelve al final, con el resto ya armado, para que la subquery solo considere
  // órdenes que cumplen los demás filtros.
  const sectorValues = filters['currentSector'];
  if (sectorValues?.length) {
    const matchedIds = await resolveCurrentSectorOrderIds({ AND: and }, sectorValues);
    and.push({ id: { in: matchedIds } });
  }

  return { AND: and };
}
