'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { portalLogout } from '@/features/Portal/actions/session.server';
import { ChevronsUpDown, KeyRound, Loader2, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTransition, type ReactNode } from 'react';

export interface PortalAccountIdentity {
  fullName: string;
  /** Número de legajo: siempre visible junto al nombre (regla del repo). */
  file: string | null;
  companyName: string;
}

function fileText(file: string | null) {
  return file ? `Legajo ${file}` : 'Sin legajo';
}

/**
 * Menú de cuenta: identidad (nombre y legajo), "Mi perfil", "Cambiar contraseña" y "Cerrar sesión". Dos disparadores
 * con el mismo contenido: el pie del menú lateral y el avatar de la cabecera. La foto llega armada desde el servidor.
 */
export function PortalAccountMenu({
  identity,
  avatar,
  variant,
  showLinks = true,
}: {
  identity: PortalAccountIdentity;
  avatar: ReactNode;
  variant: 'sidebar' | 'header';
  /** Sin "Mi perfil" ni "Cambiar contraseña" (cambio de contraseña obligatorio: solo se puede salir). */
  showLinks?: boolean;
}) {
  const [isLoggingOut, startLogout] = useTransition();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeSheet = () => isMobile && setOpenMobile(false);
  const accessibleName = `Tu cuenta: ${identity.fullName}, ${fileText(identity.file)}`;

  const trigger =
    variant === 'sidebar' ? (
      <SidebarMenuButton
        size="lg"
        aria-label={accessibleName}
        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
      >
        {avatar}
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-sm font-semibold">{identity.fullName}</span>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">{fileText(identity.file)}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="ml-auto size-4" />
      </SidebarMenuButton>
    ) : (
      <button
        type="button"
        aria-label={accessibleName}
        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex min-h-11 items-center gap-2 rounded-full p-1 outline-none focus-visible:ring-2 md:rounded-lg md:py-1 md:pr-2 md:pl-1"
      >
        {avatar}
        <span className="hidden min-w-0 text-left leading-tight md:grid">
          <span className="max-w-[12rem] truncate text-sm font-medium">{identity.fullName}</span>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">{fileText(identity.file)}</span>
        </span>
      </button>
    );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 rounded-lg"
        side={variant === 'sidebar' && !isMobile ? 'right' : 'bottom'}
        align="end"
        sideOffset={6}
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold">{identity.fullName}</span>
          <span className="text-muted-foreground block font-mono text-xs tabular-nums">{fileText(identity.file)}</span>
          <span className="text-muted-foreground block truncate text-xs">{identity.companyName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showLinks && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
                <Link href="/portal/profile" onClick={closeSheet}>
                  <UserRound aria-hidden="true" />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
                <Link href="/portal/profile#cambiar-contrasena" onClick={closeSheet}>
                  <KeyRound aria-hidden="true" />
                  Cambiar contraseña
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive min-h-10 cursor-pointer"
          disabled={isLoggingOut}
          onSelect={(event) => {
            event.preventDefault();
            startLogout(() => portalLogout());
          }}
        >
          {isLoggingOut ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <LogOut aria-hidden="true" />
          )}
          {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === 'header') return menu;
  return (
    <SidebarMenu>
      <SidebarMenuItem>{menu}</SidebarMenuItem>
    </SidebarMenu>
  );
}
