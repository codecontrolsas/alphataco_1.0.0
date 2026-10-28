/**
 * Pertenencia pestaña → claves del catálogo funcional, expandida con la herencia: un nodo del árbol de permisos está
 * habilitado si están encendidos su dueño, sus `alsoRequires` y los dueños de todos sus ancestros. Esta función calcula,
 * por cada `tabId`, el conjunto completo de claves que lo habilitan; `scripts/sync-module-catalog.ts` lo escribe en
 * `module_tab_owners` (una fila por clave) y `get_user_permissions` excluye las pestañas con alguna clave apagada.
 *
 * Módulo PURO (lo importan el script de sincronización y los tests). `nucleo` no se guarda: siempre está encendido.
 */
import {
  CORE_MODULE,
  MODULE_CATALOG,
  MODULE_KEYS,
  TAB_ALSO_REQUIRES,
  type ModuleKey,
  type TabPath,
} from './catalog.ts';

/** Forma mínima del árbol de permisos (estructuralmente compatible con `PERMISSIONS`). */
export interface PermissionTabNode {
  tabId: string;
  subtabs?: Readonly<Record<string, PermissionTabNode>>;
}
export type PermissionTree = Readonly<Record<string, { tabs: Readonly<Record<string, PermissionTabNode>> }>>;

export interface TabOwnerRow {
  tabId: string;
  path: TabPath;
  /** Dueño del nodo (la ruta más específica que lo nombra, o el heredado del ancestro). */
  owner: ModuleKey;
  /** Todas las claves que lo habilitan (dueño, `alsoRequires` y dueños de los ancestros), sin `nucleo`. */
  keys: ModuleKey[];
}

/** Ruta declarada → clave dueña. Falla si dos claves declaran el mismo nodo (cada nodo tiene un solo dueño). */
export function declaredTabOwners(): Map<TabPath, ModuleKey> {
  const owners = new Map<TabPath, ModuleKey>();
  for (const key of MODULE_KEYS) {
    for (const path of MODULE_CATALOG[key].tabs) {
      const previous = owners.get(path);
      if (previous && previous !== key) {
        throw new Error(`La pestaña ${path} tiene dos dueños: ${previous} y ${key}`);
      }
      owners.set(path, key);
    }
  }
  return owners;
}

/** Recorre el árbol y devuelve una fila por nodo con tab (los módulos raíz no tienen `tabId`). */
export function buildTabOwners(tree: PermissionTree): TabOwnerRow[] {
  const declared = declaredTabOwners();
  const rows: TabOwnerRow[] = [];

  function walk(
    tabs: Readonly<Record<string, PermissionTabNode>>,
    parentPath: TabPath,
    inheritedOwner: ModuleKey,
    inheritedKeys: ReadonlySet<ModuleKey>
  ): void {
    for (const [slug, node] of Object.entries(tabs)) {
      const path = `${parentPath}:${slug}`;
      const owner = declared.get(path) ?? inheritedOwner;
      const keys = new Set(inheritedKeys);
      keys.add(owner);
      for (const extra of TAB_ALSO_REQUIRES[path] ?? []) keys.add(extra);
      keys.delete(CORE_MODULE);
      rows.push({ tabId: node.tabId, path, owner, keys: [...keys].sort() });
      if (node.subtabs) walk(node.subtabs, path, owner, keys);
    }
  }

  for (const [moduleSlug, moduleDef] of Object.entries(tree)) {
    const owner = declared.get(moduleSlug);
    if (!owner) throw new Error(`El módulo de permisos ${moduleSlug} no tiene dueño en el catálogo funcional`);
    const keys = new Set<ModuleKey>([owner]);
    keys.delete(CORE_MODULE);
    walk(moduleDef.tabs, moduleSlug, owner, keys);
  }
  return rows;
}

/** Todas las rutas del árbol (módulos y nodos), para validar el catálogo. */
export function allTabPaths(tree: PermissionTree): Set<TabPath> {
  const paths = new Set<TabPath>();
  function walk(tabs: Readonly<Record<string, PermissionTabNode>>, parentPath: TabPath): void {
    for (const [slug, node] of Object.entries(tabs)) {
      const path = `${parentPath}:${slug}`;
      paths.add(path);
      if (node.subtabs) walk(node.subtabs, path);
    }
  }
  for (const [moduleSlug, moduleDef] of Object.entries(tree)) {
    paths.add(moduleSlug);
    walk(moduleDef.tabs, moduleSlug);
  }
  return paths;
}
