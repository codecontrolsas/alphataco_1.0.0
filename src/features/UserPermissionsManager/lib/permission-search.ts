/**
 * Búsqueda del editor de permisos: por módulo, pestaña o acción, en el nombre y en la
 * descripción, sin distinguir mayúsculas ni tildes. Pura, sin React.
 */

import { normalizeSearchText } from '@/shared/utils/search-text';
import { permissionKey } from './permission-rules';
import type { PermissionModule, PermissionTab } from './permission-types';

export interface ModuleSearchResult {
  /** Pestañas (de cualquier nivel) que se muestran */
  tabIds: Set<string>;
  /** Acciones que coinciden por su nombre o descripción, para resaltarlas */
  actionKeys: Set<string>;
}

export interface PermissionSearchResult {
  byModule: Map<string, ModuleSearchResult>;
  /** Cantidad de vistas que coinciden en todos los módulos */
  total: number;
}

const matches = (needle: string, ...texts: Array<string | null | undefined>) =>
  texts.some((text) => normalizeSearchText(text ?? '').includes(needle));

export function searchPermissions(modules: PermissionModule[], query: string): PermissionSearchResult | null {
  const needle = normalizeSearchText(query);
  if (!needle) return null;

  const byModule = new Map<string, ModuleSearchResult>();
  let total = 0;

  for (const module of modules) {
    const moduleMatches = matches(needle, module.name, module.description);
    const tabIds = new Set<string>();
    const actionKeys = new Set<string>();

    const visit = (tab: PermissionTab) => {
      let tabMatches = moduleMatches || matches(needle, tab.name, tab.description);
      for (const action of tab.actions) {
        if (matches(needle, action.name, action.description)) {
          actionKeys.add(permissionKey(tab.id, action.id));
          tabMatches = true;
        }
      }
      if (tabMatches) tabIds.add(tab.id);
      tab.subtabs.forEach(visit);
    };
    module.tabs.forEach(visit);

    if (tabIds.size > 0) {
      byModule.set(module.id, { tabIds, actionKeys });
      total += tabIds.size;
    }
  }

  return { byModule, total };
}
