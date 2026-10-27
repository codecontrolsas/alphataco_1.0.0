import type { ScreenRef } from '../catalog/types';
import { isWildcardPath } from './route-table';

/** Ruta propia del manual (fuera del dashboard, ticket 809). */
export const MANUAL_PATH = '/manual';

/** URL vieja del manual dentro del dashboard; redirige a `MANUAL_PATH` conservando `?guide=`. */
export const LEGACY_MANUAL_PATH = '/dashboard/help?tab=manual';

/** Todas las URLs del manual se arman acá. */
export function manualHref(slug?: string, anchor?: string): string {
  if (!slug) return MANUAL_PATH;
  return `${MANUAL_PATH}?guide=${encodeURIComponent(slug)}${anchor ? `#${anchor}` : ''}`;
}

/** URL de una pantalla del sistema a partir de su referencia en el catálogo. */
export function screenHref(screen: ScreenRef): string {
  if (isWildcardPath(screen.path)) throw new Error(`screenHref: ${screen.path} no es una pantalla concreta`);
  const params = new URLSearchParams();
  if (screen.tab) params.set('tab', screen.tab);
  if (screen.subtab) params.set('subtab', screen.subtab);
  const query = params.toString();
  return query ? `${screen.path}?${query}` : screen.path;
}
