import 'server-only';

import { isMaintenanceOrderStatus, nextMaintenanceOrderStatuses } from '@/features/Mantenimiento/lib/order-status';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { OrderTransitionError } from '@/features/Mantenimiento/shared/order-transition';
import {
  checkMultiplePermissionsServer,
  checkPermissionServer,
} from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Permisos de servidor de la gestión de órdenes del taller.
 *
 * Sin RLS cada `'use server'` exportado es un endpoint: el permiso se verifica acá, no en el
 * botón del cliente. Las claves coinciden con las que usa la UI del wizard
 * (`mantenimiento:gestion_ordenes`).
 *
 * Módulo server-only (NO es una Server Action).
 */

const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'gestion_ordenes';

export type OrderManagementAction = 'view' | 'create' | 'update' | 'delete';

/** Rechazo de NEGOCIO o de permisos: el caller puede devolverlo como `{ ok: false, message }`. */
export class OrderManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderManagementError';
  }
}

const ACTION_LABELS: Record<OrderManagementAction, string> = {
  view: 'ver',
  create: 'crear',
  update: 'modificar',
  delete: 'eliminar',
};

/** Exige la acción en la tab `gestion_ordenes`. */
export async function requireOrderManagementPermission(action: OrderManagementAction): Promise<void> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, action))) {
    throw new OrderManagementError(`No tenés permiso para ${ACTION_LABELS[action]} en la gestión de órdenes`);
  }
}

/** Exige TODAS las acciones indicadas (sin repetidas). */
export async function requireOrderManagementPermissions(actions: Iterable<OrderManagementAction>): Promise<void> {
  for (const action of new Set(actions)) {
    await requireOrderManagementPermission(action);
  }
}

/**
 * Lectura compartida: el wizard y los catálogos (sectores, talleres, grupos) se montan también
 * desde Órdenes de Mantenimiento y la Bandeja de Aprobaciones, que tienen su propia tab. Alcanza
 * `view` en cualquiera de ellas (los datos igual se acotan a la empresa activa).
 */
const READ_TABS = ['gestion_ordenes', 'ordenes_mantenimiento', 'bandeja_aprobaciones', 'seguimiento_taller'] as const;

export async function requireOrderManagementReadAccess(): Promise<void> {
  const result = await checkMultiplePermissionsServer(
    READ_TABS.map((tabSlug) => ({ moduleSlug: MODULE_SLUG, tabSlug, actionSlug: 'view' }))
  );
  const allowed = READ_TABS.some((tabSlug) => result.get(`${MODULE_SLUG}:${tabSlug}:view`) === true);
  if (!allowed) throw new OrderManagementError('No tenés permiso para ver la gestión de órdenes');
}

/**
 * Estado terminal: la máquina de `lib/order-status.ts` no admite ninguna salida
 * (`completed`, `rejected`). Un estado desconocido no se considera terminal.
 */
export function isTerminalOrderStatus(status: string): boolean {
  return isMaintenanceOrderStatus(status) && nextMaintenanceOrderStatuses(status).length === 0;
}

/**
 * Lockea el pedido (orden de locks pedido → OT) y rechaza la edición si está en un estado
 * terminal: en un pedido cerrado no se agregan ni se quitan ítems.
 */
export async function lockEditableOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await lockMaintenanceOrder(tx, orderId);
  const order = await tx.maintenance_orders.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new OrderManagementError('Pedido de mantenimiento no encontrado');
  if (isTerminalOrderStatus(order.status)) {
    throw new OrderManagementError(`El pedido está en estado "${order.status}" y ya no admite cambios`);
  }
}

/** Convierte los rechazos esperados en `{ ok: false, message }`; el resto se relanza. */
export function toFailure(error: unknown): { ok: false; message: string } {
  if (error instanceof OrderManagementError || error instanceof OrderTransitionError)
    return { ok: false, message: error.message };
  throw error;
}
