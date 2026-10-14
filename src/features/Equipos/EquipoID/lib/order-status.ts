import type { Badge } from '@/components/ui/badge';
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type React from 'react';

/**
 * Estados de una orden de mantenimiento: un único mapa (rótulo, variante del badge e ícono) para la celda de
 * la tabla, las opciones del filtro y el diálogo de detalle. Antes el diálogo tenía una copia con 4 estados menos.
 */

export type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

export type OrderStatus =
  | 'pending_scheduling'
  | 'date_confirmed'
  | 'scheduled'
  | 'in_workshop'
  | 'pending_workshop_validation'
  | 'pending_operations_validation'
  | 'operations_rejected'
  | 'workshop_rejected'
  // Ticket 676: el taller puede rechazar un pedido desde el paso "Por Programar".
  | 'rejected'
  | 'completed';

/** Orden en que se listan las opciones del filtro (recorre el circuito de la orden). */
export const ORDER_STATUS_ORDER: readonly OrderStatus[] = [
  'pending_scheduling',
  'date_confirmed',
  'scheduled',
  'in_workshop',
  'pending_workshop_validation',
  'pending_operations_validation',
  'operations_rejected',
  'workshop_rejected',
  'rejected',
  'completed',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  // pending_scheduling y date_confirmed pasaron a ser estados habituales con el ticket 594:
  // al programar la fecha el pedido va directo a date_confirmed.
  pending_scheduling: 'Por programar',
  date_confirmed: 'Pendiente de ingreso a taller',
  scheduled: 'Programada',
  in_workshop: 'En Taller',
  pending_workshop_validation: 'Pend. Validacion Taller',
  pending_operations_validation: 'Pend. Validacion Operaciones',
  operations_rejected: 'Rechazada por Ops',
  workshop_rejected: 'Rechazada por Taller',
  rejected: 'Rechazada por Taller',
  completed: 'Completada',
};

export const ORDER_STATUS_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending_scheduling: 'secondary',
  date_confirmed: 'secondary',
  scheduled: 'warning',
  in_workshop: 'info',
  pending_workshop_validation: 'yellow',
  pending_operations_validation: 'yellow',
  operations_rejected: 'destructive',
  workshop_rejected: 'destructive',
  rejected: 'destructive',
  completed: 'success',
};

export const ORDER_STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  pending_scheduling: Clock,
  date_confirmed: CalendarCheck,
  scheduled: CalendarClock,
  in_workshop: Wrench,
  pending_workshop_validation: ClipboardCheck,
  pending_operations_validation: ClipboardCheck,
  operations_rejected: XCircle,
  workshop_rejected: Ban,
  rejected: Ban,
  completed: CheckCircle2,
};

export function isOrderStatus(value: string | null | undefined): value is OrderStatus {
  return !!value && value in ORDER_STATUS_LABELS;
}

/** Rótulo del estado; un valor desconocido se muestra tal cual en vez de ocultarse. */
export function getOrderStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status;
}
