import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/features/Layout/header/components/ThemeToggle';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { portalLogout } from '@/features/Portal/actions/session.server';
import { LogOut } from 'lucide-react';
import { PortalNav } from './PortalNav';

/**
 * Marco del portal (mobile-first): cabecera con la empresa y el empleado, navegación inferior en el celular y en la
 * cabecera en pantallas anchas. Solo recibe los campos que muestra (no el objeto entero del empleado).
 */
export function PortalShell({
  employee,
  showNav = true,
  children,
}: {
  employee: Pick<PortalEmployee, 'companyName' | 'firstname' | 'lastname' | 'file' | 'picture'>;
  showNav?: boolean;
  children: React.ReactNode;
}) {
  const fullName = `${employee.firstname} ${employee.lastname}`.trim();
  const initials = `${employee.firstname[0] ?? ''}${employee.lastname[0] ?? ''}`.toUpperCase();

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <a
        href="#portal-content"
        className="focus:bg-background focus:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
      >
        Saltar al contenido
      </a>
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top,0px)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Avatar className="size-10 shrink-0">
            {employee.picture && <AvatarImage src={employee.picture} alt="" />}
            <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{fullName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {employee.companyName}
              {employee.file && <span className="font-mono tabular-nums"> · Legajo {employee.file}</span>}
            </p>
          </div>
          {showNav && <PortalNav variant="inline" />}
          <ThemeToggle />
          <form action={portalLogout}>
            <Button type="submit" variant="ghost" size="icon" className="size-10" aria-label="Cerrar sesión">
              <LogOut aria-hidden="true" className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <div
        id="portal-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 outline-none md:pb-10"
      >
        {children}
      </div>

      {showNav && <PortalNav variant="bottom" />}
    </div>
  );
}
