/**
 * Almacenes etapa 5 — piezas compartidas por las tablas de entregas de ropa (historial del empleado,
 * reporte global y panel del operario): select de deposito/costo/anulacion, filtros server-side
 * (estado, deposito, costo) y serializacion del costo respetando el permiso `view_prices`.
 *
 * Sin `'use server'`: son helpers puros que importan las server actions de cada tabla.
 */
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';

/** Valores del filtro "Estado" (columna virtual derivada de `cancelled_at`). */
export const DELIVERY_STATUS_ACTIVE = 'active';
export const DELIVERY_STATUS_CANCELLED = 'cancelled';

export const deliveryStatusLabels: Record<string, string> = {
  [DELIVERY_STATUS_ACTIVE]: 'Vigente',
  [DELIVERY_STATUS_CANCELLED]: 'Anulada',
};

/** Campos extra que las tres tablas agregan al select de `clothing_deliveries`. */
export const DELIVERY_STATUS_SELECT = {
  cancelled_at: true,
  cancel_reason: true,
} as const;

export const DELIVERY_STOCK_SELECT = {
  ...DELIVERY_STATUS_SELECT,
  warehouse_id: true,
  warehouse: { select: { id: true, name: true } },
  stock_movement: { select: { total_cost: true } },
} as const;

type Filters = Record<string, string[]>;

/** Estado: `cancelled_at IS NULL` (vigente) / `IS NOT NULL` (anulada). Ambos valores = sin filtro. */
export function buildDeliveryStatusWhere(filters: Filters): Record<string, unknown> {
  const values = filters['status'];
  if (!Array.isArray(values) || values.length === 0) return {};
  const wantsActive = values.includes(DELIVERY_STATUS_ACTIVE);
  const wantsCancelled = values.includes(DELIVERY_STATUS_CANCELLED);
  if (wantsActive && !wantsCancelled) return { cancelled_at: null };
  if (wantsCancelled && !wantsActive) return { cancelled_at: { not: null } };
  return {};
}

/** Deposito: ids + "Sin asignar" (`NULL_FILTER_VALUE`) para entregas anteriores a la etapa. */
export function buildDeliveryWarehouseWhere(filters: Filters): Record<string, unknown> {
  const values = filters['warehouse'];
  if (!Array.isArray(values) || values.length === 0) return {};
  const ids = values.filter((v) => v !== NULL_FILTER_VALUE);
  if (values.includes(NULL_FILTER_VALUE)) {
    return {
      OR: [{ warehouse_id: null }, ...(ids.length > 0 ? [{ warehouse_id: { in: ids } }] : [])],
    };
  }
  return { warehouse_id: { in: ids } };
}

/**
 * Costo: coincidencia exacta del importe tipeado (un Decimal no admite `contains`). Solo se aplica con
 * `view_prices`: filtrar por importe sin permiso permitiria deducir el costo por tanteo.
 */
export function buildDeliveryCostWhere(filters: Filters, canViewPrices: boolean): Record<string, unknown> {
  if (!canViewPrices) return {};
  const raw = filters['cost']?.[0]?.trim();
  if (!raw) return {};
  const amount = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) return {};
  return { stock_movement: { total_cost: amount } };
}

/**
 * Une estado + deposito + costo bajo `AND` para que su `OR` (deposito nulo) no pise otros `OR`
 * del where de la tabla (busqueda global, FK nulas).
 */
export function buildDeliveryStockWhere(filters: Filters, canViewPrices: boolean): Record<string, unknown> {
  const parts = [
    buildDeliveryStatusWhere(filters),
    buildDeliveryWarehouseWhere(filters),
    buildDeliveryCostWhere(filters, canViewPrices),
  ].filter((p) => Object.keys(p).length > 0);
  return parts.length > 0 ? { AND: parts } : {};
}

/** Columnas que el `buildFiltersWhere` generico debe ignorar (las resuelve `buildDeliveryStockWhere`). */
export const DELIVERY_STOCK_MANUAL_COLUMNS = ['status', 'warehouse', 'cost'];

/**
 * Reemplaza `stock_movement` (Decimal, no serializable hacia el cliente) por `cost` como string.
 * Sin `view_prices` el valor NO sale del servidor: `cost` va siempre en `null`.
 */
export function serializeDeliveryCost<T extends { stock_movement: { total_cost: { toString(): string } } | null }>(
  row: T,
  canViewPrices: boolean
): Omit<T, 'stock_movement'> & { cost: string | null } {
  const { stock_movement, ...rest } = row;
  return { ...rest, cost: canViewPrices && stock_movement ? stock_movement.total_cost.toString() : null };
}
