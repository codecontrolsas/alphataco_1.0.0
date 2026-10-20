import { ContextualHelp } from '@/features/Ayuda/Manual/components/header/ContextualHelp';
import {
  NotificationBellAsync,
  NotificationBellFallback,
} from '@/features/Notifications/components/NotificationBellAsync';
import { Suspense } from 'react';
import { HeaderNavAsync } from './components/HeaderNavAsync';
import { HeaderNavFallback } from './components/HeaderNavFallback';
import { ThemeToggle } from './components/ThemeToggle';

/**
 * Barra de contexto del dashboard, dentro del `SidebarInset`.
 *
 * Su trabajo es ubicar (módulo / sección activa) y mover (menú "Ir a…", Ctrl/⌘ K). La marca, el
 * selector de empresa y el menú de usuario viven en el sidebar. A la derecha quedan la ayuda
 * contextual ("?", abre la guía del manual de la pantalla actual), la campanita de avisos y el cambio de tema.
 *
 * En md+ es una grilla de tres zonas para que el disparador quede centrado; en móvil, un flex
 * donde el contexto trunca. `HeaderNavAsync` lee `useSearchParams` (vía el cliente) y permisos:
 * con `cacheComponents` activo Next exige el límite de Suspense.
 */
export function DashboardHeader() {
  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 border-border/60 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-4 md:grid md:grid-cols-[1fr_minmax(0,24rem)_1fr]">
      <Suspense fallback={<HeaderNavFallback />}>
        <HeaderNavAsync />
      </Suspense>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {/* Lee permisos y el manual: dinámico, necesita su propio límite de Suspense. */}
        <Suspense fallback={null}>
          <ContextualHelp />
        </Suspense>
        {/* Lee la sesión y el contador: dinámico, con su propio límite de Suspense. */}
        <Suspense fallback={<NotificationBellFallback />}>
          <NotificationBellAsync />
        </Suspense>
        <ThemeToggle />
      </div>
    </header>
  );
}
