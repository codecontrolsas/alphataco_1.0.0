import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandMark } from '@/shared/components/brand/BrandMark';
import { BRAND_NAME } from '@/shared/lib/branding';
import Link from 'next/link';
import { Suspense } from 'react';
import { CompanySwitcherAsync } from './components/async/CompanySwitcherAsync';
import { NavMainAsync } from './components/async/NavMainAsync';
import { NavUserAsync } from './components/async/NavUserAsync';

/**
 * AppSidebar — el sidebar del dashboard, con la anatomía del bloque `sidebar-07` de shadcn:
 * header (marca y selector de empresa), content (módulos con sus tabs), footer (usuario) y rail.
 *
 * Es un Server Component: la estructura se renderiza de inmediato y cada pieza que depende
 * de datos (empresas, permisos, perfil) llega por streaming en su propio Suspense, igual que
 * hacía el sidebar anterior.
 *
 * El estado abierto/colapsado NO vive acá: lo maneja `SidebarProvider` (persiste en cookie,
 * atajo Ctrl/Cmd+B y Sheet en mobile), que monta el layout del dashboard.
 */
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="gap-2 border-b p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-1 text-lg font-bold lowercase group-data-[collapsible=icon]:justify-center"
        >
          <BrandMark size={28} />
          <span className="group-data-[collapsible=icon]:hidden">{BRAND_NAME}</span>
        </Link>
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-md" />}>
          <CompanySwitcherAsync />
        </Suspense>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <Suspense fallback={<NavMainFallback />}>
          <NavMainAsync />
        </Suspense>
      </SidebarContent>

      <SidebarSeparator className="mx-0" />

      <SidebarFooter className="p-2">
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-md" />}>
          <NavUserAsync />
        </Suspense>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Esqueleto del menú mientras se resuelven permisos.
 *
 * No usa `SidebarMenuSkeleton` de shadcn a propósito: ese componente sortea el ancho de cada
 * fila con `Math.random()`, y Next 16 rechaza el build ("used `Math.random()` inside a Client
 * Component without a Suspense boundary above it") porque el fallback se prerenderiza. Los
 * anchos van fijos y alternados, que además evita que el esqueleto cambie en cada render.
 */
const FALLBACK_WIDTHS = ['70%', '55%', '80%', '60%', '75%', '50%', '65%', '58%'];

function NavMainFallback() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {FALLBACK_WIDTHS.map((width) => (
          <SidebarMenuItem key={width} className="flex h-8 items-center gap-2 px-2">
            <Skeleton className="size-4 shrink-0 rounded-md" />
            <Skeleton className="h-4" style={{ width }} />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
