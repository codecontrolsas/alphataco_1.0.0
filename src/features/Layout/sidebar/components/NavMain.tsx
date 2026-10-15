'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useUnreadSupportTicketsCount } from '@/features/Ayuda/hooks/useUnreadSupportTicketsCount';
import { useActiveDashboardBoard } from '@/features/Dashboard/Boards/hooks/useActiveDashboardBoard';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  SECTION_COUNTER_LABELS,
  SUB_ITEM_ICONS,
  navigationLinks,
  subLinkHref,
  subLinkKey,
  type NavBadge,
} from '../constants/navigation';
import { useModuleSectionCounts } from '../hooks/useModuleSectionCounts';
import type { SectionCountsByTab } from '../types/section-counts';
import { buildSidebarItems, createLinkRegex, findBestMatch, resolveActiveTab } from '../utils/sidebar.utils';

/**
 * Estilos de los items.
 *
 * Las clases van escritas completas y no compuestas en runtime: Tailwind v4 escanea el código
 * como texto plano y una clase armada por concatenación nunca se genera.
 *
 * Lo activo se marca con el tinte de marca (`sidebar-active`) y texto en el color de marca; el
 * hover es un neutro aparte (`sidebar-accent`), para que lo elegido no se confunda con lo que
 * se está tocando.
 */
const ITEM_BUTTON = cn(
  'transition-colors',
  'data-[active=true]:bg-sidebar-active data-[active=true]:font-semibold data-[active=true]:text-sidebar-active-foreground',
  'data-[active=true]:hover:bg-sidebar-active data-[active=true]:hover:text-sidebar-active-foreground',
  '[&>svg]:text-sidebar-foreground/60 [&>svg]:transition-colors',
  'data-[active=true]:[&>svg]:text-sidebar-active-foreground'
);

const BADGE_CLASS = 'bg-destructive text-destructive-foreground pointer-events-none';

function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/**
 * Carga los contadores de sección de UN módulo y se los pasa a sus sub-items. Se monta dentro del
 * `CollapsibleContent` (Radix no monta el contenido cerrado), así que solo consulta el módulo
 * desplegado. Sin dato (cargando, sin permiso o error) no hay badge.
 */
function SectionCountsLoader({
  moduleSlug,
  children,
}: {
  moduleSlug: string;
  children: (counts: SectionCountsByTab | undefined) => React.ReactNode;
}) {
  const { data } = useModuleSectionCounts(moduleSlug);
  return <>{children(data)}</>;
}

interface NavMainProps {
  /** Modulos a los que el usuario tiene acceso (`getUserAccessibleModulesServer`). */
  accessibleModuleSlugs: string[];
  /** Por modulo, las claves de sub-item visibles (`resolveVisibleTabs`). */
  visibleTabs: Record<string, string[]>;
}

/**
 * Menu principal del sidebar: un item por modulo y, para los que tienen tabs, un desplegable
 * con sus tabs de primer nivel (`?tab=<slug>`).
 *
 * Al colapsar el sidebar a iconos el desplegable no se abre: `SidebarMenuButton` muestra el
 * `tooltip` en su lugar, que es el comportamiento del bloque sidebar-07.
 */
export function NavMain({ accessibleModuleSlugs, visibleTabs }: NavMainProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const subTabParam = searchParams.get('subtab');

  // Contadores de los items que declaran `badge` (hoy: tickets de soporte sin leer).
  const unreadTickets = useUnreadSupportTicketsCount();
  const countFor = (badge: NavBadge | undefined): number => (badge === 'support-tickets' ? unreadTickets : 0);

  const items = useMemo(
    () => buildSidebarItems(navigationLinks, accessibleModuleSlugs, visibleTabs),
    [accessibleModuleSlugs, visibleTabs]
  );

  const activeName = useMemo(
    () =>
      findBestMatch(
        items.map((item) => ({ ...item, regex: createLinkRegex(item.href) })),
        pathname
      ),
    [items, pathname]
  );

  // En el Dashboard el acceso activo sale del tablero que se está viendo (`?tablero=`), no de `?tab=`.
  const dashboardBoard = useActiveDashboardBoard(pathname === '/dashboard');

  if (items.length === 0) {
    return (
      <SidebarGroup>
        <div className="text-sidebar-foreground/70 px-2 py-6 text-center text-sm group-data-[collapsible=icon]:hidden">
          <p className="font-medium">Sin acceso</p>
          <p className="mt-1 text-xs">No tenés permisos para acceder a ningún módulo. Contactá al administrador.</p>
        </div>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs font-semibold tracking-wider uppercase">
        Módulos
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {items.map((item) => {
          const isActive = item.name === activeName;
          // Con sub-items, el contador del modulo sale de los sub-items VISIBLES (ya filtrados
          // por permiso): quien ve Ayuda solo por el Manual no tiene tickets que leer.
          const badgeCount = item.items?.length
            ? Math.max(0, ...item.items.map((subItem) => countFor(subItem.badge)))
            : countFor(item.badge);
          const activeTab = !isActive
            ? null
            : item.moduleSlug === 'dashboard' && dashboardBoard
              ? dashboardBoard.navTab
              : resolveActiveTab(item, tabParam, subTabParam);

          // Sin sub-items visibles (modulo de una sola tab, sin tabs, o sin permisos sobre
          // ninguna): link directo, sin desplegable. Al ser la hoja, va con relleno sólido.
          if (!item.items?.length) {
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton asChild tooltip={item.name} isActive={isActive} className={ITEM_BUTTON}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
                {badgeCount > 0 && (
                  <SidebarMenuBadge className={BADGE_CLASS}>{badgeLabel(badgeCount)}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          }

          return (
            <Collapsible key={item.name} asChild defaultOpen={isActive} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  {/* El módulo padre no se rellena: lo elegido es el sub-item, y dos rellenos juntos compiten. */}
                  <SidebarMenuButton
                    tooltip={item.name}
                    isActive={isActive}
                    className={cn(
                      ITEM_BUTTON,
                      'data-[active=true]:bg-transparent data-[active=true]:hover:bg-sidebar-accent'
                    )}
                  >
                    <item.icon />
                    <span>{item.name}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                {/* Con el desplegable cerrado el contador del sub-item no se ve: se repite
                    sobre el modulo, corrido a la izquierda del chevron. */}
                {badgeCount > 0 && (
                  <SidebarMenuBadge className={cn(BADGE_CLASS, 'right-8 group-data-[state=open]/collapsible:hidden')}>
                    {badgeLabel(badgeCount)}
                  </SidebarMenuBadge>
                )}
                <CollapsibleContent>
                  <SidebarMenuSub className="border-sidebar-border/70">
                    <SectionCountsLoader moduleSlug={item.moduleSlug}>
                      {(sectionCounts) =>
                        item.items?.map((subItem) => {
                          const subKey = subLinkKey(subItem);
                          const SubIcon = SUB_ITEM_ICONS[`${item.moduleSlug}:${subKey}`];
                          const subCount = countFor(subItem.badge);
                          const counterLabel = SECTION_COUNTER_LABELS[`${item.moduleSlug}:${subKey}`];
                          const sectionCount = counterLabel ? sectionCounts?.[subKey] ?? null : null;

                          return (
                            <SidebarMenuSubItem key={subKey}>
                              <SidebarMenuSubButton asChild isActive={subKey === activeTab} className={ITEM_BUTTON}>
                                <Link href={subLinkHref(item.href, subItem)}>
                                  {SubIcon && <SubIcon />}
                                  <span>{subItem.name}</span>
                                  {subCount > 0 && (
                                    <span
                                      className={cn(
                                        BADGE_CLASS,
                                        'ml-auto flex h-5 min-w-5 items-center justify-center px-1 text-xs font-medium tabular-nums'
                                      )}
                                    >
                                      {badgeLabel(subCount)}
                                    </span>
                                  )}
                                  {sectionCount !== null && sectionCount > 0 && (
                                    <span
                                      role="img"
                                      aria-label={`${sectionCount.toLocaleString('es-AR')} ${counterLabel}`}
                                      className="bg-brand-subtle text-brand-subtle-foreground ml-auto flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums"
                                    >
                                      {sectionCount > 99 ? '99+' : sectionCount.toLocaleString('es-AR')}
                                    </span>
                                  )}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })
                      }
                    </SectionCountsLoader>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
