import { PARAM_SEPARATOR } from '@/shared/components/common/DataTable/helpers';

/** `tableId`/`paramNamespace` de la tabla de sectores de taller (`SectoresTable`). */
export const WORKSHOP_SECTORS_TABLE_ID = 'workshop-sectors';

/**
 * Enlace a la administración de los sectores de taller, que desde el ticket 778 vive en
 * Mantenimiento > Sectores > Administrar sectores (antes, Configuración > Taller).
 *
 * @param workshopName si viene, la tabla abre filtrada por ese taller (filtro `workshop` de la tabla).
 */
export function buildSectorsAdminHref(workshopName?: string): string {
  const params = new URLSearchParams({ tab: 'workshop_view', vista: 'administrar' });
  if (workshopName) params.set(`${WORKSHOP_SECTORS_TABLE_ID}${PARAM_SEPARATOR}workshop`, workshopName);
  return `/dashboard/maintenance?${params.toString()}`;
}
