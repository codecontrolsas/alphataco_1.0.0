/**
 * Dónde vive cada vista de Gomería desde el ticket 778 (antes todas eran pestañas internas de Mantenimiento > Gomería).
 * Módulo sin directiva: lo usan servidor y cliente. El permiso de cada vista NO cambió (`mantenimiento:<tab>`).
 */

/** Gestión > Taller > paso «Gomería» (órdenes). */
export const GOMERIA_ORDERS_HREF = '/dashboard/maintenance?tab=maint_operaciones&vista=taller&taller_step=gomeria';

/** Almacenes > Cubiertas (catálogo de cubiertas). */
export const GOMERIA_CATALOG_HREF = '/dashboard/warehouse?tab=cubiertas';

/** Configuración > Taller > Cubiertas (plantillas, marcas y tipos). */
export const GOMERIA_SETTINGS_HREF = '/dashboard/configuration?tab=mantenimiento&subtab=cubiertas';
