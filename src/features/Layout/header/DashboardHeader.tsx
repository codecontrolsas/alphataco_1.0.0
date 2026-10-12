import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ModeToggle } from '@/components/ui/ToogleDarkButton';
import { ContextualHelp } from '@/features/Ayuda/Manual/components/header/ContextualHelp';
import { GlobalSearchAsync } from '@/features/Layout/search/components/GlobalSearchAsync';
import { DashboardBreadcrumb } from '@/features/Layout/sidebar/components/DashboardBreadcrumb';
import { Suspense } from 'react';

/**
 * Header del dashboard, dentro del `SidebarInset` — es el header del bloque `sidebar-07`.
 *
 * Reemplaza al navbar: el hamburger pasó a ser `SidebarTrigger` (el estado lo maneja
 * `SidebarProvider`), y el selector de empresa y el menú de usuario se mudaron al sidebar.
 * Acá quedan las migas, el buscador "Ir a…" (Ctrl+K), la ayuda contextual ("?", abre la guía del manual de la pantalla actual)
 * y el cambio de tema.
 *
 * El Suspense es obligatorio: `DashboardBreadcrumb` lee `useSearchParams` y con
 * `cacheComponents` activo Next exige el límite.
 */
export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95">
      <div className="flex w-full items-center gap-2 px-4 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Suspense fallback={null}>
          <DashboardBreadcrumb />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          {/* Buscador "Ir a…" (mapa v2): resuelve permisos en el servidor, su propio Suspense. */}
          <Suspense fallback={null}>
            <GlobalSearchAsync />
          </Suspense>
          {/* Lee permisos y el manual: dinámico, necesita su propio límite de Suspense. */}
          <Suspense fallback={null}>
            <ContextualHelp />
          </Suspense>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
