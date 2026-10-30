'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  isSectionActive,
  sectionsFor,
  type PortalBadgeCounts,
  type PortalSection,
} from '@/features/Portal/navigation/registry';
import { BrandMark } from '@/shared/components/brand/BrandMark';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { NavBadge } from './NavBadge';

/**
 * Menú lateral del portal (bloque `sidebar` de shadcn): fijo y colapsable a íconos en escritorio (Ctrl/⌘ B o el riel),
 * hoja lateral en el celular. Las secciones salen del registro (`navigation/registry.ts`) filtradas por las que el
 * servidor dejó visibles; los contadores llegan por streaming.
 */
export function PortalSidebar({
  visibleIds,
  badges,
  companyName,
  account,
}: {
  visibleIds: string[];
  badges: Promise<PortalBadgeCounts>;
  companyName: string;
  /** Pie con la identidad y el menú de cuenta (se arma en el servidor: lleva la foto). */
  account: ReactNode;
}) {
  const sections = sectionsFor(visibleIds);
  const main = sections.filter((s) => s.group === 'main');
  const accountSections = sections.filter((s) => s.group === 'account');

  return (
    <Sidebar collapsible="icon" className="border-r motion-reduce:transition-none">
      <SidebarHeader className="border-b p-3">
        <Link
          href="/portal"
          aria-label={`Portal del empleado, ${companyName}: ir al inicio`}
          className="focus-visible:ring-sidebar-ring flex min-h-11 items-center gap-2.5 rounded-md px-1 outline-none focus-visible:ring-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <BrandMark size={28} />
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block text-sm leading-tight font-semibold">Portal del empleado</span>
            <span className="text-muted-foreground block truncate text-xs">{companyName}</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Secciones del portal">
          <NavGroup label="Secciones" sections={main} badges={badges} />
          {accountSections.length > 0 && <NavGroup label="Tu cuenta" sections={accountSections} badges={badges} />}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">{account}</SidebarFooter>
      <SidebarRail aria-label="Mostrar u ocultar el menú lateral" title="Mostrar u ocultar el menú (Ctrl/⌘ B)" />
    </Sidebar>
  );
}

function NavGroup({
  label,
  sections,
  badges,
}: {
  label: string;
  sections: PortalSection[];
  badges: Promise<PortalBadgeCounts>;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sections.map((section) => {
            const active = isSectionActive(pathname, section.href);
            const Icon = section.icon;
            return (
              <SidebarMenuItem key={section.id}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={section.label}
                  className="relative h-11 text-[0.9375rem] md:h-9 md:text-sm"
                >
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    // En el celular el menú es una hoja: se cierra al elegir un destino.
                    onClick={() => isMobile && setOpenMobile(false)}
                  >
                    <Icon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    {section.badge && (
                      <Suspense fallback={null}>
                        <NavBadge counts={badges} badgeKey={section.badge} variant="sidebar" />
                      </Suspense>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
