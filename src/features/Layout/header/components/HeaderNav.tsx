'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useActiveDashboardBoard } from '@/features/Dashboard/Boards/hooks/useActiveDashboardBoard';
import { Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { navigationLinks, subLinkKey } from '../../sidebar/constants/navigation';
import { buildSidebarItems, createLinkRegex, findBestMatch, resolveActiveTab } from '../../sidebar/utils/sidebar.utils';

// El diálogo (cmdk + Dialog) no hace falta hasta el primer uso: el disparador queda liviano.
const HeaderCommandMenu = dynamic(() => import('./HeaderCommandMenu'), { ssr: false });

interface HeaderNavProps {
  /** Módulos a los que el usuario tiene acceso. */
  accessibleModuleSlugs: string[];
  /** Por módulo, las claves de sección visibles (`resolveVisibleTabs`). */
  visibleTabs: Record<string, string[]>;
}

const subscribeNoop = () => () => {};
const getShortcutLabel = () => (/Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl K');
// El servidor no conoce la plataforma: Ctrl K como valor inicial evita el hydration mismatch.
const getServerShortcutLabel = () => 'Ctrl K';

/**
 * Barra de contexto del header: ubica (módulo / sección activa) y mueve (menú "Ir a…", Ctrl/⌘ K).
 *
 * Renderiza dos zonas de la grilla del header (contexto y disparador); la tercera (ayuda y tema)
 * la pone `DashboardHeader`. Lee `useSearchParams`, por eso va dentro de un Suspense.
 */
export function HeaderNav({ accessibleModuleSlugs, visibleTabs }: HeaderNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const subTabParam = searchParams.get('subtab');

  const [open, setOpen] = useState(false);
  const [menuRequested, setMenuRequested] = useState(false);
  // Refleja `open` para el listener global sin re-suscribirlo en cada cambio.
  const openMenuRef = useRef(false);
  openMenuRef.current = open;
  const shortcutLabel = useSyncExternalStore(subscribeNoop, getShortcutLabel, getServerShortcutLabel);

  const items = useMemo(
    () => buildSidebarItems(navigationLinks, accessibleModuleSlugs, visibleTabs),
    [accessibleModuleSlugs, visibleTabs]
  );

  const activeName = findBestMatch(
    items.map((link) => ({ ...link, regex: createLinkRegex(link.href) })),
    pathname
  );
  const activeModule = items.find((link) => link.name === activeName);
  const activeKey = activeModule ? resolveActiveTab(activeModule, tabParam, subTabParam) : null;
  // En el Dashboard la sección es el tablero que se está viendo (`?tablero=`): su nombre, aunque sea propio.
  const dashboardBoard = useActiveDashboardBoard(pathname === '/dashboard');
  const activeSection =
    activeModule?.moduleSlug === 'dashboard' && dashboardBoard
      ? dashboardBoard.name
        ? { name: dashboardBoard.name }
        : undefined
      : activeModule?.items?.find((sub) => subLinkKey(sub) === activeKey);

  const ModuleIcon = activeModule?.icon;

  const openMenu = () => {
    setMenuRequested(true);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
        // El propio menú ("Ir a…") es un diálogo: si hay otro modal abierto, no se superpone.
        if (!openMenuRef.current && openDialogs.length > 0) return;
        event.preventDefault();
        setMenuRequested(true);
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
        <SidebarTrigger aria-label="Mostrar u ocultar el menú" className="size-10 shrink-0" />

        {activeModule && (
          <>
            {/* En md+ el contexto completo: ícono / módulo / sección. */}
            <div className="hidden min-w-0 items-center gap-2 md:flex">
              {ModuleIcon && (
                <span
                  aria-hidden="true"
                  className="bg-brand-subtle text-brand-subtle-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
                >
                  <ModuleIcon className="size-4" />
                </span>
              )}
              <nav aria-label="Ubicación actual" className="flex min-w-0 items-center gap-2 text-sm">
                <span className="text-muted-foreground truncate">{activeModule.name}</span>
                {activeSection && (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground/40">
                      /
                    </span>
                    <span aria-current="page" className="text-foreground truncate font-medium">
                      {activeSection.name}
                    </span>
                  </>
                )}
              </nav>
            </div>

            {/* En móvil solo el nombre de la sección (o del módulo si no tiene secciones). */}
            <span className="text-foreground min-w-0 truncate text-sm font-medium md:hidden">
              {activeSection?.name ?? activeModule.name}
            </span>
          </>
        )}
      </div>

      <div className="flex justify-end md:justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Ir a un módulo o sección"
          onClick={openMenu}
          className="size-10 md:hidden"
        >
          <Search className="size-4" />
        </Button>

        <button
          type="button"
          onClick={openMenu}
          aria-label="Ir a un módulo o sección"
          aria-keyshortcuts="Control+K Meta+K"
          className="border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted focus-visible:ring-ring hidden h-9 w-full max-w-sm items-center gap-2 rounded-md border px-3 text-sm transition-colors outline-none focus-visible:ring-2 md:flex"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">Ir a un módulo o sección…</span>
          <kbd className="bg-background text-muted-foreground border-border/70 pointer-events-none shrink-0 rounded border px-1.5 font-sans text-xs">
            {shortcutLabel}
          </kbd>
        </button>
      </div>

      {menuRequested && <HeaderCommandMenu open={open} onOpenChange={setOpen} items={items} />}
    </>
  );
}
