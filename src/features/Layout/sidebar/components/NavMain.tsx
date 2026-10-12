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
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { NAV_GROUP_LABELS, SUB_ITEM_ICONS, navigationLinks, type NavBadge, type NavigationLink } from '../constants/navigation';
import { buildSidebarItems, createLinkRegex, findBestMatch, resolveActiveTab } from '../utils/sidebar.utils';

/**
 * Estilos del item de módulo.
 *
 * Las clases van escritas completas y no compuestas en runtime: Tailwind v4 escanea el código
 * como texto plano y una clase armada por concatenación nunca se genera.
 *
 * El ítem activo (módulo o tab) se marca con la barra de marca de 2px a la izquierda (`before:`)
 * sobre `bg-sidebar-accent`, sin relleno sólido. El hover es neutro: el verde queda para lo activo.
 */
const MODULE_BUTTON = cn(
  'relative transition-colors',
  // Barra de marca del item activo. Se reserva el espacio siempre para que el texto no salte.
  'before:pointer-events-none before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-sidebar-primary before:opacity-0',
  'hover:bg-sidebar-accent/60',
  'data-[active=true]:before:opacity-100',
  'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
  'data-[active=true]:hover:bg-sidebar-accent',
  // El icono acompaña al estado del item.
  '[&>svg]:text-muted-foreground',
  'data-[active=true]:[&>svg]:text-primary-text'
);

const BADGE_CLASS = 'bg-danger text-destructive-foreground pointer-events-none tabular-nums';

function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** Igual que el módulo: la barra de 2px marca la tab activa (la hoja del árbol). */
const SUB_ITEM_BUTTON = cn(
  'relative transition-colors',
  'before:pointer-events-none before:absolute before:inset-y-1 before:-left-px before:w-0.5 before:bg-sidebar-primary before:opacity-0',
  'hover:bg-sidebar-accent/60',
  'data-[active=true]:before:opacity-100',
  'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
  'data-[active=true]:hover:bg-sidebar-accent',
  '[&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-primary-text'
);

interface NavMainProps {
  /** Modulos a los que el usuario tiene acceso (`getUserAccessibleModulesServer`). */
  accessibleModuleSlugs: string[];
  /** Por modulo, los `tabSlug` de primer nivel visibles (`resolveVisibleTabs`). */
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

  // Contadores de los items que declaran `badge` (hoy: tickets de soporte sin leer).
  const unreadTickets = useUnreadSupportTicketsCount();
  const countFor = (badge: NavBadge | undefined): number => (badge === 'support-tickets' ? unreadTickets : 0);

  const items = useMemo(
    () => buildSidebarItems(navigationLinks, accessibleModuleSlugs, visibleTabs),
    [accessibleModuleSlugs, visibleTabs]
  );

  const activeName = useMemo(
    () => findBestMatch(items.map((item) => ({ ...item, regex: createLinkRegex(item.href) })), pathname),
    [items, pathname]
  );

  if (items.length === 0) {
    return (
      <SidebarGroup>
        <div className="text-muted-foreground px-2 py-6 text-center text-sm group-data-[collapsible=icon]:hidden">
          <p className="font-medium">Sin acceso</p>
          <p className="mt-1 text-xs">No tenés permisos para acceder a ningún módulo. Contactá al administrador.</p>
        </div>
      </SidebarGroup>
    );
  }

  const renderItem = (item: NavigationLink) => {
    const isActive = item.name === activeName;
    // Con sub-items, el contador del modulo sale de los sub-items VISIBLES (ya filtrados
    // por permiso): quien ve Ayuda solo por el Manual no tiene tickets que leer.
    const badgeCount = item.items?.length
      ? Math.max(0, ...item.items.map((subItem) => countFor(subItem.badge)))
      : countFor(item.badge);
    const activeTab = isActive ? resolveActiveTab(item, tabParam) : null;

    // Sin sub-items visibles (modulo de una sola tab, sin tabs, o sin permisos sobre
    // ninguna): link directo, sin desplegable.
    if (!item.items?.length) {
      return (
        <SidebarMenuItem key={item.name}>
          <SidebarMenuButton
            asChild
            tooltip={item.name}
            isActive={isActive}
            className={MODULE_BUTTON}
          >
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
            <SidebarMenuButton tooltip={item.name} isActive={isActive} className={MODULE_BUTTON}>
              <item.icon />
              <span>{item.name}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          {/* Con el desplegable cerrado el contador del sub-item no se ve: se repite
              sobre el modulo, corrido a la izquierda del chevron. */}
          {badgeCount > 0 && (
            <SidebarMenuBadge
              className={cn(BADGE_CLASS, 'right-8 group-data-[state=open]/collapsible:hidden')}
            >
              {badgeLabel(badgeCount)}
            </SidebarMenuBadge>
          )}
          <CollapsibleContent>
            <SidebarMenuSub className="border-sidebar-border/70">
              {item.items.map((subItem) => {
                const SubIcon = SUB_ITEM_ICONS[`${item.moduleSlug}:${subItem.tabSlug}`];
                const subCount = countFor(subItem.badge);

                return (
                  <SidebarMenuSubItem key={subItem.tabSlug}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={subItem.tabSlug === activeTab}
                      className={SUB_ITEM_BUTTON}
                    >
                      <Link href={`${item.href}?tab=${subItem.tabSlug}`}>
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
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  // Mapa v2: arriba "Hoy" (sin grupo), después los grupos con rótulo en su orden, y al pie del
  // menú Ajustes y Soporte. Un grupo sin ningún módulo accesible no se dibuja.
  const ungrouped = items.filter((item) => !item.group);
  const footer = items.filter((item) => item.group === 'pie');
  const sections = (Object.keys(NAV_GROUP_LABELS) as Array<keyof typeof NAV_GROUP_LABELS>)
    .map((group) => ({ group, label: NAV_GROUP_LABELS[group], links: items.filter((item) => item.group === group) }))
    .filter((section) => section.links.length > 0);

  return (
    <>
      {ungrouped.length > 0 && (
        <SidebarGroup>
          <SidebarMenu className="gap-0.5">{ungrouped.map(renderItem)}</SidebarMenu>
        </SidebarGroup>
      )}
      {sections.map((section) => (
        <SidebarGroup key={section.group} className="py-1">
          <SidebarGroupLabel className="text-overline text-muted-foreground">{section.label}</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">{section.links.map(renderItem)}</SidebarMenu>
        </SidebarGroup>
      ))}
      {footer.length > 0 && (
        <SidebarGroup className="mt-auto">
          <SidebarMenu className="gap-0.5">{footer.map(renderItem)}</SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}
