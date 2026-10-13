import { subLinkKey, type NavigationLink } from '../constants/navigation';

/**
 * Crea una expresión regular para matching de rutas
 *
 * @param href - URL del link
 * @returns RegExp para matching
 */
export function createLinkRegex(href: string): RegExp {
  return new RegExp(`^${href.replace(/\//g, '\\/')}(\/|$)`);
}

/**
 * Encuentra el mejor match entre links y pathname
 *
 * @param links - Array de links con regex
 * @param pathname - Pathname actual
 * @returns Nombre del link con mejor match
 */
export function findBestMatch(links: Array<NavigationLink & { regex: RegExp }>, pathname: string): string {
  type Best = { link: NavigationLink | null; matchLength: number };

  const bestMatch = links.reduce<Best>(
    (best, link) => {
      const match = pathname.match(link.regex);
      const matchLength = match ? match[0].length : 0;
      return matchLength > best.matchLength ? { link, matchLength } : best;
    },
    { link: null, matchLength: 0 }
  );

  return bestMatch.link?.name || '';
}

/**
 * Arma los items del sidebar: deja los modulos accesibles, los ordena por `position` y recorta
 * los sub-items a las tabs visibles para el usuario.
 *
 * Pura a proposito: el filtro de tabs por permisos necesita `permissions-map` entero y se
 * resuelve en el servidor (`resolveVisibleTabs`); aca solo llega la lista de slugs ya visibles,
 * asi que el mapa de permisos no viaja al bundle del cliente.
 *
 * @param links - Navegacion declarada (`navigationLinks`)
 * @param accessibleModuleSlugs - Modulos a los que el usuario tiene acceso
 * @param visibleTabs - Por modulo, los `tabSlug` que el usuario puede ver
 */
export function buildSidebarItems(
  links: readonly NavigationLink[],
  accessibleModuleSlugs: readonly string[],
  visibleTabs: Readonly<Record<string, readonly string[]>>
): NavigationLink[] {
  const accessible = new Set(accessibleModuleSlugs);

  return links
    .filter((link) => accessible.has(link.moduleSlug))
    .sort((a, b) => a.position - b.position)
    .map((link) => {
      if (!link.items) return link;

      const visible = new Set(visibleTabs[link.moduleSlug] ?? []);
      return { ...link, items: link.items.filter((item) => visible.has(subLinkKey(item))) };
    });
}

/**
 * Sub-item que hay que marcar como activo dentro de un modulo.
 *
 * Replica lo que hace `TabsManagerServer` al elegir la tab a mostrar: usa el `?tab=` de la URL
 * si apunta a una tab visible y, si no (param ausente, invalido o sin permiso), cae a la
 * primera tab de la lista. En los 9 modulos con tabs el `defaultTab` declarado ES la primera,
 * asi que "la primera visible" y "la que el modulo abre por defecto" coinciden.
 *
 * Si la tab tiene varios sub-items (cada uno con su `subTabSlug`), elige el del `?subtab=` y,
 * sin ese param, el primero.
 *
 * @returns la clave del sub-item activo (`subLinkKey`), o `null` si el modulo no tiene sub-items visibles
 */
export function resolveActiveTab(
  item: NavigationLink,
  tabParam: string | null,
  subTabParam: string | null = null
): string | null {
  const items = item.items;
  if (!items?.length) return null;

  const activeTab = tabParam && items.some((sub) => sub.tabSlug === tabParam) ? tabParam : items[0].tabSlug;
  const candidates = items.filter((sub) => sub.tabSlug === activeTab);
  const active = candidates.find((sub) => sub.subTabSlug && sub.subTabSlug === subTabParam) ?? candidates[0];

  return subLinkKey(active);
}
