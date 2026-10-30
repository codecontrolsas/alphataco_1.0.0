'use client';

import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { isTopLevelPath, sectionForPath } from '@/features/Portal/navigation/registry';
import { cn } from '@/lib/utils';
import { Menu, PanelLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Abre la hoja del menú (celular) o colapsa el menú lateral (escritorio). Nombre y estado accesibles en español. */
export function PortalSidebarToggle() {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 shrink-0 md:size-9"
      aria-label={isMobile ? 'Abrir el menú' : expanded ? 'Achicar el menú lateral' : 'Expandir el menú lateral'}
      aria-expanded={expanded}
      title={isMobile ? undefined : 'Mostrar u ocultar el menú (Ctrl/⌘ B)'}
      onClick={toggleSidebar}
    >
      {isMobile ? <Menu aria-hidden="true" className="size-5" /> : <PanelLeft aria-hidden="true" className="size-4" />}
    </Button>
  );
}

/** Nombre de la sección actual (sale del registro). Desde `md`; en el celular el lugar lo ocupa la identidad. */
export function PortalSectionTitle() {
  const pathname = usePathname();
  const section = sectionForPath(pathname);
  if (!section) return null;
  return <p className="hidden truncate text-sm font-semibold md:block">{section.label}</p>;
}

/**
 * Contenido principal. Deja lugar abajo para la barra del celular solo cuando se muestra (destinos de primer nivel),
 * y suma `scroll-padding` para que lo enfocado no quede bajo la cabecera fija.
 */
export function PortalMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const withBottomNav = isTopLevelPath(pathname);
  return (
    <main
      id="portal-content"
      tabIndex={-1}
      className={cn(
        'mx-auto w-full max-w-5xl flex-1 px-4 pt-6 outline-none sm:px-6 lg:px-8 lg:pt-8 [html:has(&)]:scroll-pt-20',
        withBottomNav ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-12' : 'pb-12'
      )}
    >
      {children}
    </main>
  );
}
