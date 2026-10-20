import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { navigationLinks, subLinkKey } from '../constants/navigation';

/**
 * Tabs de primer nivel (y subtabs elegidas desde el sidebar) que el usuario puede ver, por modulo.
 *
 * La decision de "esta tab se ve" NO vive aca: la toma `createTabVisibilityChecker`, la misma
 * que usan `SectionManagerServer` (que monta la seccion) y `TabsManagerServer` (que monta las
 * subtabs). Si el sidebar tuviera su propia copia de la regla podria ofrecer una seccion que
 * la pagina no renderiza.
 *
 * @param permissions - mapa `"<modulo>:<tab>:<accion>" -> boolean` (`getUserPermissionsMapServer`)
 * @returns por `moduleSlug`, las claves (`subLinkKey`) visibles en el orden declarado en `navigationLinks`
 */
export function resolveVisibleTabs(permissions: Readonly<Record<string, boolean>>): Record<string, string[]> {
  const isTabVisible = createTabVisibilityChecker(permissions);
  const visibleTabs: Record<string, string[]> = {};

  for (const link of navigationLinks) {
    if (!link.items) continue;

    visibleTabs[link.moduleSlug] = link.items
      .filter((item) =>
        item.subTabSlug
          ? isTabVisible(link.moduleSlug, item.subTabSlug)
          : [item.tabSlug, ...(item.visibleWhenAny ?? [])].some((tab) => isTabVisible(link.moduleSlug, tab))
      )
      .map(subLinkKey);
  }

  return visibleTabs;
}
