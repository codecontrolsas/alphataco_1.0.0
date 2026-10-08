/**
 * Estados de `maintenance_orders.status` en los que una orden ya no recibe imputaciones de
 * material (spec §4.2: solo ordenes abiertas). Lo usan el motor (validacion) y el buscador de
 * ordenes del formulario.
 */
export const CLOSED_MAINTENANCE_ORDER_STATUSES = ['completed', 'rejected'] as const;
