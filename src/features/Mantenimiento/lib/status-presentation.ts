import type { Badge } from '@/components/ui/badge';
import type { work_order_item_status, work_order_status } from '@/generated/prisma/client';
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock,
  Lock,
  Pause,
  PlayCircle,
  Undo2,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type React from 'react';
import type { MaintenanceOrderStatus } from './order-status';

/**
 * Fuente única de la presentación de estados de Mantenimiento (etiqueta, tono e ícono) por entidad.
 *
 * Módulo sin directiva: lo consumen el servidor, el cliente y el PDF de la orden. La máquina de estados
 * (qué transiciones son válidas) vive en `order-status.ts`; acá solo se decide cómo se LEE cada estado.
 * Los mapas históricos de cada pantalla derivan de este archivo para que una misma palabra no tenga
 * dos redacciones distintas según desde dónde se mire.
 */

export type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

export type StatusTone = 'neutral' | 'pending' | 'warn' | 'brand' | 'info' | 'ok' | 'danger';

export interface StatusUi {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export const TONE_TO_BADGE: Record<StatusTone, BadgeVariant> = {
  neutral: 'secondary',
  pending: 'pending',
  warn: 'warning',
  brand: 'default',
  info: 'info',
  ok: 'success',
  danger: 'destructive',
};

/** Órdenes de mantenimiento (`maintenance_orders.status`). */
export const ORDER_STATUS_UI: Record<MaintenanceOrderStatus, StatusUi> = {
  pending_scheduling: { label: 'Pend. de programación', tone: 'warn', icon: Clock },
  date_confirmed: { label: 'Fecha confirmada', tone: 'pending', icon: CalendarCheck },
  scheduled: { label: 'Programada', tone: 'info', icon: CalendarClock },
  in_workshop: { label: 'En taller', tone: 'brand', icon: Wrench },
  pending_workshop_validation: { label: 'Pend. validación de taller', tone: 'warn', icon: ClipboardCheck },
  pending_operations_validation: { label: 'Pend. validación de operaciones', tone: 'warn', icon: ClipboardCheck },
  operations_rejected: { label: 'Rechazada por operaciones', tone: 'danger', icon: XCircle },
  workshop_rejected: { label: 'Rechazada por taller', tone: 'danger', icon: Ban },
  rejected: { label: 'Rechazada', tone: 'danger', icon: Ban },
  completed: { label: 'Completada', tone: 'ok', icon: CheckCircle2 },
};

/** Solicitudes de mantenimiento (`maintenance_requests.status`). */
export const REQUEST_STATUS_UI: Record<'pending_approval' | 'approved' | 'rejected', StatusUi> = {
  pending_approval: { label: 'Pendiente de aprobación', tone: 'warn', icon: Clock },
  approved: { label: 'Aprobada', tone: 'ok', icon: CheckCircle2 },
  rejected: { label: 'Rechazada', tone: 'danger', icon: XCircle },
};

/**
 * Órdenes de trabajo (`work_orders.status`). `blocked` no es un valor de la BD: es presentación de una OT
 * con tareas trabadas (`OperatorPanel/actions/blocking.ts`).
 */
export const WORK_ORDER_STATUS_UI: Record<work_order_status | 'blocked', StatusUi> = {
  pending: { label: 'Pendiente', tone: 'pending', icon: Clock },
  in_progress: { label: 'En progreso', tone: 'brand', icon: PlayCircle },
  paused: { label: 'Pausada', tone: 'warn', icon: Pause },
  completed: { label: 'Completada', tone: 'ok', icon: CheckCircle2 },
  completed_partial: { label: 'Completada parcial', tone: 'warn', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', tone: 'danger', icon: Ban },
  blocked: { label: 'Bloqueada', tone: 'pending', icon: Lock },
};

/** Tareas / reparaciones de una OT (`work_order_item_repairs.status`, enum `work_order_item_status`). */
export const REPAIR_STATUS_UI: Record<work_order_item_status, StatusUi> = {
  pending: { label: 'Pendiente', tone: 'pending', icon: Clock },
  in_progress: { label: 'En progreso', tone: 'brand', icon: PlayCircle },
  completed: { label: 'Completado', tone: 'ok', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', tone: 'neutral', icon: Ban },
  pending_approval: { label: 'Pend. de aprobación', tone: 'warn', icon: ClipboardCheck },
  reassignment_requested: { label: 'Devuelto', tone: 'danger', icon: Undo2 },
  rejected: { label: 'Rechazado', tone: 'danger', icon: XCircle },
};

/** Orden en que se listan las opciones de filtro de estado de una orden (recorre el circuito). */
export const ORDER_STATUS_FILTER_ORDER: readonly MaintenanceOrderStatus[] = [
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

export type StatusEntity = 'order' | 'request' | 'workOrder' | 'repair';

const TABLES: Record<StatusEntity, Readonly<Record<string, StatusUi>>> = {
  order: ORDER_STATUS_UI,
  request: REQUEST_STATUS_UI,
  workOrder: WORK_ORDER_STATUS_UI,
  repair: REPAIR_STATUS_UI,
};

/**
 * Presentación de un estado. Un valor desconocido se muestra tal cual (en vez de ocultarse) y `null`
 * se lee "Sin estado".
 */
export function getStatusUi(entity: StatusEntity, status: string | null | undefined): StatusUi {
  if (!status) return { label: 'Sin estado', tone: 'neutral', icon: CircleDashed };
  return TABLES[entity][status] ?? { label: status, tone: 'neutral', icon: CircleDashed };
}

export const getStatusLabel = (entity: StatusEntity, status: string | null | undefined) =>
  getStatusUi(entity, status).label;

/** Variante de `Badge` de un estado. */
export const getStatusBadgeVariant = (entity: StatusEntity, status: string | null | undefined): BadgeVariant =>
  TONE_TO_BADGE[getStatusUi(entity, status).tone];

/** Estados que aparecen en logs históricos y ya no existen como valor vigente de ninguna entidad. */
export const LEGACY_HISTORY_LABELS: Record<string, string> = {
  date_rejected: 'Fecha rechazada',
  scheduled: 'Programada',
};
