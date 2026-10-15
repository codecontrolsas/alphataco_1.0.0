/**
 * Reglas del editor de permisos (puras, sin React). Las usan el editor del rol y el del usuario,
 * así la cascada vive en un solo lugar:
 *
 * - Toda acción exige "Ver" en su pestaña: activar cualquier acción activa "Ver".
 * - Una sub-pestaña no se alcanza sin entrar a su pestaña padre: activar algo en una hija activa
 *   también el "Ver" de sus ancestros.
 * - Quitar "Ver" quita todas las acciones de esa pestaña y de sus sub-pestañas.
 * - "Subir privados" exige "Ver privados"; quitar "Ver privados" quita "Subir privados".
 *
 * Las reglas solo actúan sobre lo que la persona toca en el editor; no reescriben datos guardados.
 */

import type { PermissionModule, PermissionPair, PermissionPreset, PermissionTab } from './permission-types';

export const permissionKey = (tabId: string, actionId: string) => `${tabId}:${actionId}`;

export function pairFromKey(key: string): PermissionPair {
  const index = key.indexOf(':');
  return { tabId: key.slice(0, index), actionId: key.slice(index + 1) };
}

export interface TabIndexEntry {
  tab: PermissionTab;
  moduleId: string;
  parentId: string | null;
  /** 0 = pestaña de primer nivel */
  depth: number;
  /** Ids de las acciones por slug, para resolver "Ver", "Ver privados", etc. */
  actionIdBySlug: Map<string, string>;
  /** Pestaña y todas sus descendientes (incluida ella). */
  subtreeIds: string[];
}

export interface PermissionIndex {
  tabs: Map<string, TabIndexEntry>;
  /** slug de la acción por clave `tabId:actionId` */
  slugByKey: Map<string, string>;
  /** Todas las claves que el editor puede mostrar. */
  allKeys: Set<string>;
}

export function buildPermissionIndex(modules: PermissionModule[]): PermissionIndex {
  const tabs = new Map<string, TabIndexEntry>();
  const slugByKey = new Map<string, string>();
  const allKeys = new Set<string>();

  const visit = (tab: PermissionTab, moduleId: string, parentId: string | null, depth: number): string[] => {
    const actionIdBySlug = new Map<string, string>();
    for (const action of tab.actions) {
      actionIdBySlug.set(action.slug, action.id);
      const key = permissionKey(tab.id, action.id);
      slugByKey.set(key, action.slug);
      allKeys.add(key);
    }
    const subtreeIds = [tab.id];
    const entry: TabIndexEntry = { tab, moduleId, parentId, depth, actionIdBySlug, subtreeIds };
    tabs.set(tab.id, entry);
    for (const subtab of tab.subtabs) subtreeIds.push(...visit(subtab, moduleId, tab.id, depth + 1));
    return subtreeIds;
  };

  for (const module of modules) for (const tab of module.tabs) visit(tab, module.id, null, 0);

  return { tabs, slugByKey, allKeys };
}

/** Claves de todas las acciones de las pestañas indicadas (sin recorrer hijas). */
export function keysOfTabs(index: PermissionIndex, tabIds: Iterable<string>): string[] {
  const keys: string[] = [];
  for (const tabId of tabIds) {
    const entry = index.tabs.get(tabId);
    if (!entry) continue;
    for (const action of entry.tab.actions) keys.push(permissionKey(tabId, action.id));
  }
  return keys;
}

/** Pestañas de un módulo, cada una con sus descendientes. */
export function moduleTabIds(index: PermissionIndex, module: PermissionModule): string[] {
  return module.tabs.flatMap((tab) => index.tabs.get(tab.id)?.subtreeIds ?? []);
}

function viewKeyOf(index: PermissionIndex, tabId: string): string | null {
  const viewId = index.tabs.get(tabId)?.actionIdBySlug.get('view');
  return viewId ? permissionKey(tabId, viewId) : null;
}

/** Suma lo que exige tener `key`: el "Ver" propio y el de los ancestros, y "Ver privados". */
function addRequirements(next: Set<string>, index: PermissionIndex, key: string) {
  const { tabId } = pairFromKey(key);
  const slug = index.slugByKey.get(key);
  const entry = index.tabs.get(tabId);
  if (!entry) return;

  if (slug === 'upload_private') {
    const viewPrivateId = entry.actionIdBySlug.get('view_private');
    if (viewPrivateId) next.add(permissionKey(tabId, viewPrivateId));
  }

  let currentId: string | null = tabId;
  while (currentId) {
    const viewKey = viewKeyOf(index, currentId);
    if (viewKey) next.add(viewKey);
    currentId = index.tabs.get(currentId)?.parentId ?? null;
  }
}

/** Saca lo que depende de `key`: sin "Ver", nada de la pestaña ni de sus hijas. */
function removeDependents(next: Set<string>, index: PermissionIndex, key: string) {
  const { tabId } = pairFromKey(key);
  const slug = index.slugByKey.get(key);
  const entry = index.tabs.get(tabId);
  if (!entry) return;

  if (slug === 'view') {
    for (const dependent of keysOfTabs(index, entry.subtreeIds)) next.delete(dependent);
  }
  if (slug === 'view_private') {
    const uploadId = entry.actionIdBySlug.get('upload_private');
    if (uploadId) next.delete(permissionKey(tabId, uploadId));
  }
}

/** Activa o desactiva una acción aplicando la cascada. Devuelve un conjunto nuevo. */
export function applyToggle(
  granted: ReadonlySet<string>,
  index: PermissionIndex,
  key: string,
  on: boolean
): Set<string> {
  const next = new Set(granted);
  if (on) {
    next.add(key);
    addRequirements(next, index, key);
  } else {
    next.delete(key);
    removeDependents(next, index, key);
  }
  return next;
}

/** Atajo sobre un grupo de pestañas: sin acceso, solo ver, o todo. */
export function applyPreset(
  granted: ReadonlySet<string>,
  index: PermissionIndex,
  tabIds: string[],
  preset: PermissionPreset
): Set<string> {
  const next = new Set(granted);
  for (const key of keysOfTabs(index, tabIds)) next.delete(key);
  if (preset === 'none') return next;

  for (const tabId of tabIds) {
    const entry = index.tabs.get(tabId);
    if (!entry) continue;
    for (const action of entry.tab.actions) {
      if (preset === 'view' && action.slug !== 'view') continue;
      const key = permissionKey(tabId, action.id);
      next.add(key);
      addRequirements(next, index, key);
    }
  }
  return next;
}

/**
 * Acciones activas de una pestaña que dependen de su "Ver" (las propias y las de sus hijas):
 * se muestran al lado de "Ver" para que se sepa qué se pierde al quitarlo.
 */
export function countDependentsOfView(granted: ReadonlySet<string>, index: PermissionIndex, tabId: string): number {
  const entry = index.tabs.get(tabId);
  if (!entry) return 0;
  const viewKey = viewKeyOf(index, tabId);
  return keysOfTabs(index, entry.subtreeIds).filter((key) => key !== viewKey && granted.has(key)).length;
}

/** Altas y bajas entre dos conjuntos (lo que se va a guardar). */
export function diffPermissionSets(before: ReadonlySet<string>, after: ReadonlySet<string>) {
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of after) if (!before.has(key)) added.push(key);
  for (const key of before) if (!after.has(key)) removed.push(key);
  return { added, removed };
}
