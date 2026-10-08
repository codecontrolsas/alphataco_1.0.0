import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getMyTicketsWithUnread } from '@/features/Ayuda/actions/support-tickets';
import { SupportTicketsRealtimeProvider } from '@/features/Ayuda/components/SupportTicketsRealtimeProvider';
import { MY_TICKETS_WITH_UNREAD_QUERY_KEY } from '@/features/Ayuda/hooks/queryKeys';
import { DashboardHeader } from '@/features/Layout/header/DashboardHeader';
import { AppSidebar } from '@/features/Layout/sidebar/AppSidebar';
import { PasswordChangeAlertWrapper } from '@/shared/components/auth/PasswordChangeAlertWrapper';
import TanstackQueryInicializador from '@/shared/providers/TanstackQueryInicializador';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { Suspense } from 'react';

/**
 * DashboardLayout - Layout principal del dashboard
 *
 * Estructura para soportar Next.js 16 + cacheComponents:
 * - El shell (sidebar, header, content) se renderiza inmediato como fallback del Suspense.
 * - En paralelo, DashboardWithHydration hace prefetch server-side de los tickets sin leer
 *   y rehidrata el QueryClient. Cuando termina, el badge aparece sin nuevo fetch en cliente.
 * - Sin el Suspense, el `await prefetchQuery` bloquearía la navegación (Next.js 16 lo prohíbe).
 *
 * El sidebar arranca abierto en cada carga. `SidebarProvider` guarda el estado en la cookie
 * `sidebar_state`, pero sólo la respeta si se la pasan como `defaultOpen` en el render inicial,
 * y leerla acá con `cookies()` vuelve bloqueante a todo el layout: con `cacheComponents` activo
 * el build falla con "Uncached data was accessed outside of <Suspense>". El sidebar anterior
 * (zustand, sin persistencia) tampoco recordaba el estado, así que no se pierde nada.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TanstackQueryInicializador>
      <Suspense fallback={<DashboardLayoutShell>{children}</DashboardLayoutShell>}>
        <DashboardWithHydration>{children}</DashboardWithHydration>
      </Suspense>
    </TanstackQueryInicializador>
  );
}

async function DashboardWithHydration({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  try {
    await queryClient.prefetchQuery({
      queryKey: MY_TICKETS_WITH_UNREAD_QUERY_KEY,
      queryFn: () => getMyTicketsWithUnread(),
    });
  } catch {
    // Si el prefetch falla, el cliente igual reintenta vía useQuery
  }
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <DashboardLayoutShell>{children}</DashboardLayoutShell>
    </HydrationBoundary>
  );
}

function DashboardLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <SupportTicketsRealtimeProvider>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:border focus:border-border-strong focus:bg-card focus:px-3 focus:py-2 focus:text-label"
        >
          Saltar al contenido
        </a>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <DashboardHeader />
          <Suspense fallback={null}>
            <PasswordChangeAlertWrapper />
          </Suspense>
          {/* `@container/page`: lo usa PageHeader para su banda a todo el ancho del área de contenido. */}
          <div id="main-content" tabIndex={-1} className="@container/page min-w-0 flex-1 outline-none">
            <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SupportTicketsRealtimeProvider>
  );
}
