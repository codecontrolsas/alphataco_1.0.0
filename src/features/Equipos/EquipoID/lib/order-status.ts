import type { MaintenanceOrderStatus } from '@/features/Mantenimiento/lib/order-status';
import {
  ORDER_STATUS_FILTER_ORDER,
  ORDER_STATUS_UI,
  TONE_TO_BADGE,
  getStatusLabel,
  type BadgeVariant,
} from '@/features/Mantenimiento/lib/status-presentation';
import type { LucideIcon } from 'lucide-react';

/**
 * Estados de una orden de mantenimiento para el legajo del equipo: rótulo, variante del badge e ícono.
 * Todo deriva de `Mantenimiento/lib/status-presentation.ts` (fuente única); este módulo conserva los
 * nombres que ya consumen la celda de la tabla, las opciones del filtro y el diálogo de detalle.
 */

export type { BadgeVariant };

export type OrderStatus = MaintenanceOrderStatus;

/** Orden en que se listan las opciones del filtro (recorre el circuito de la orden). */
export const ORDER_STATUS_ORDER: readonly OrderStatus[] = ORDER_STATUS_FILTER_ORDER;

export const ORDER_STATUS_LABELS = Object.fromEntries(
  ORDER_STATUS_ORDER.map((status) => [status, ORDER_STATUS_UI[status].label])
) as Record<OrderStatus, string>;

export const ORDER_STATUS_VARIANTS = Object.fromEntries(
  ORDER_STATUS_ORDER.map((status) => [status, TONE_TO_BADGE[ORDER_STATUS_UI[status].tone]])
) as Record<OrderStatus, BadgeVariant>;

export const ORDER_STATUS_ICONS = Object.fromEntries(
  ORDER_STATUS_ORDER.map((status) => [status, ORDER_STATUS_UI[status].icon])
) as Record<OrderStatus, LucideIcon>;

export function isOrderStatus(value: string | null | undefined): value is OrderStatus {
  return !!value && value in ORDER_STATUS_UI;
}

/** Rótulo del estado; un valor desconocido se muestra tal cual en vez de ocultarse. */
export function getOrderStatusLabel(status: string | null | undefined): string {
  return getStatusLabel('order', status);
}
