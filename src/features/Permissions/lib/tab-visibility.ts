import { PERMISSIONS } from '../permissions-map';
import { findTabDef } from './permissions-map-utils';
import { hasInferredView } from './visibility';

/**
 * Regla ÚNICA de "¿esta tab se ve?".
 *
 * Una tab es visible si el usuario tiene `view` explícito sobre ella, o si tiene `view` sobre
 * alguna de sus subtabs a cualquier profundidad (visibilidad inferida): una tab padre sin
 * permiso propio igual se muestra para poder llegar a lo que sí tiene concedido.
 *
 * Vivía escrita tres veces —la copia inline con `any` dentro de `TabsManagerServer`, el
 * sidebar, y de nuevo en el render de secciones—, con el riesgo de que el menú ofreciera una
 * sección que la página no monta, o al revés. Ahora la deciden todos acá.
 *
 * @param permissions mapa `"<modulo>:<tab>:<accion>" -> boolean` (`getUserPermissionsMapServer`)
 * @returns un predicado `(moduleSlug, tabSlug) => boolean`, con los slugs concedidos
 *          pre-calculados una sola vez
 */
export function createTabVisibilityChecker(permissions: Readonly<Record<string, boolean>>) {
  // Por módulo: los slugs con `view` concedido. Se agrupa por módulo porque hay slugs que se
  // repiten entre módulos (`tipos-de-documentos` está en empleados, equipos y documentacion)
  // y un set global los mezclaría.
  const grantedByModule = new Map<string, Set<string>>();

  for (const [key, granted] of Object.entries(permissions)) {
    if (!granted) continue;

    const [moduleSlug, tabSlug, action] = key.split(':');
    if (action !== 'view' || !moduleSlug || !tabSlug) continue;

    const slugs = grantedByModule.get(moduleSlug) ?? new Set<string>();
    slugs.add(tabSlug);
    grantedByModule.set(moduleSlug, slugs);
  }

  return function isTabVisible(moduleSlug: string, tabSlug: string): boolean {
    const granted = grantedByModule.get(moduleSlug);
    if (!granted) return false;

    if (granted.has(tabSlug)) return true;

    return hasInferredView(findTabDef(PERMISSIONS, moduleSlug, tabSlug), granted);
  };
}
