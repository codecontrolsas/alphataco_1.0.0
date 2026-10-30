import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/features/Layout/header/components/ThemeToggle';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import type { PortalBadgeCounts } from '@/features/Portal/navigation/registry';
import { Suspense, type CSSProperties, type ReactNode } from 'react';
import { PortalAccountMenu, type PortalAccountIdentity } from './PortalAccountMenu';
import { PortalAvatar } from './PortalAvatar';
import { PortalBottomNav } from './PortalBottomNav';
import { PortalMain, PortalSectionTitle, PortalSidebarToggle } from './PortalHeaderParts';
import { PortalNoticesBellFallback } from './PortalNoticesBell';
import { PortalNoticesBellAsync } from './PortalNoticesBellAsync';
import { PortalSidebar } from './PortalSidebar';

/** Alto de la cabecera fija: lo usan las barras pegajosas de las páginas (examen) para quedar debajo. */
const SHELL_STYLE = { '--portal-header-h': '3.5rem' } as CSSProperties;

export function identityOf(employee: PortalEmployee): PortalAccountIdentity {
  return {
    fullName: `${employee.lastname} ${employee.firstname}`.trim(),
    file: employee.file,
    companyName: employee.companyName,
  };
}

function SkipLink() {
  return (
    <a
      href="#portal-content"
      className="bg-background text-foreground focus-visible:ring-ring sr-only z-[60] rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2"
    >
      Saltar al contenido
    </a>
  );
}

/** En el celular, la identidad ocupa el centro de la cabecera: nombre (se corta) y legajo (nunca se corta). */
function MobileIdentity({ identity }: { identity: PortalAccountIdentity }) {
  return (
    <div className="min-w-0 flex-1 leading-tight md:hidden">
      <p className="truncate text-sm font-semibold">{identity.fullName}</p>
      <p className="text-muted-foreground flex min-w-0 gap-1 text-xs">
        <span className="shrink-0 font-mono tabular-nums">
          {identity.file ? `Legajo ${identity.file}` : 'Sin legajo'}
        </span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{identity.companyName}</span>
      </p>
    </div>
  );
}

/**
 * Marco de aplicación del portal: menú lateral (colapsable en escritorio, hoja en el celular), cabecera fija con la
 * sección, los avisos, el tema y la cuenta (nombre y legajo siempre visibles), contenido y barra inferior del celular.
 * Todo lo navegable sale del registro (`navigation/registry.ts`).
 */
export function PortalAppShell({
  employee,
  visibleIds,
  badges,
  defaultOpen,
  children,
}: {
  employee: PortalEmployee;
  visibleIds: string[];
  badges: Promise<PortalBadgeCounts>;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const identity = identityOf(employee);
  return (
    <SidebarProvider defaultOpen={defaultOpen} style={SHELL_STYLE}>
      <SkipLink />
      <PortalSidebar
        visibleIds={visibleIds}
        badges={badges}
        companyName={employee.companyName}
        account={
          <PortalAccountMenu identity={identity} avatar={<PortalAvatar employee={employee} />} variant="sidebar" />
        }
      />
      <div className="bg-background relative flex min-h-dvh w-full min-w-0 flex-1 flex-col">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 border-b pt-[env(safe-area-inset-top,0px)] backdrop-blur">
          <div className="flex h-(--portal-header-h) items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
            <PortalSidebarToggle />
            <MobileIdentity identity={identity} />
            <div className="hidden min-w-0 flex-1 md:block">
              <PortalSectionTitle />
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <Suspense fallback={<PortalNoticesBellFallback />}>
                <PortalNoticesBellAsync employee={employee} />
              </Suspense>
              <ThemeToggle />
              <PortalAccountMenu
                identity={identity}
                avatar={<PortalAvatar employee={employee} className="size-8 rounded-full md:rounded-lg" />}
                variant="header"
              />
            </div>
          </div>
        </header>
        <PortalMain>{children}</PortalMain>
      </div>
      <PortalBottomNav visibleIds={visibleIds} badges={badges} />
    </SidebarProvider>
  );
}

/**
 * Marco reducido para el cambio de contraseña obligatorio: sin menú, sin barra y sin consultas de pendientes (hasta
 * cambiarla no se ve nada más). Mantiene el nombre, el legajo y la salida.
 */
export function PortalLockedShell({ employee, children }: { employee: PortalEmployee; children: ReactNode }) {
  const identity = identityOf(employee);
  return (
    <SidebarProvider defaultOpen={false} style={SHELL_STYLE}>
      <SkipLink />
      <div className="bg-background flex min-h-dvh w-full flex-col">
        <header className="bg-background/90 sticky top-0 z-30 border-b pt-[env(safe-area-inset-top,0px)] backdrop-blur">
          <div className="mx-auto flex h-(--portal-header-h) w-full max-w-5xl items-center gap-2 px-4">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{identity.fullName}</p>
              <p className="text-muted-foreground flex min-w-0 gap-1 text-xs">
                <span className="shrink-0 font-mono tabular-nums">
                  {identity.file ? `Legajo ${identity.file}` : 'Sin legajo'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{identity.companyName}</span>
              </p>
            </div>
            <ThemeToggle />
            <PortalAccountMenu
              identity={identity}
              avatar={<PortalAvatar employee={employee} className="size-8 rounded-full" />}
              variant="header"
              showLinks={false}
            />
          </div>
        </header>
        <PortalMain>{children}</PortalMain>
      </div>
    </SidebarProvider>
  );
}
