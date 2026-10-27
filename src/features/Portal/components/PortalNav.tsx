'use client';

import { cn } from '@/lib/utils';
import { FileText, Home, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/portal', label: 'Inicio', icon: Home },
  { href: '/portal/documents', label: 'Documentos', icon: FileText },
  { href: '/portal/profile', label: 'Perfil', icon: UserRound },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/portal' ? pathname === '/portal' : pathname.startsWith(href);
}

/**
 * Navegación del portal: barra inferior fija en el celular (con el margen del área segura) y fila de enlaces en la
 * cabecera desde `md`. Mismos destinos en las dos: `variant` decide solo la forma.
 */
export function PortalNav({ variant }: { variant: 'bottom' | 'inline' }) {
  const pathname = usePathname();

  if (variant === 'inline') {
    return (
      <nav aria-label="Secciones del portal" className="hidden md:block">
        <ul className="flex items-center gap-1">
          {ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Secciones del portal"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex min-h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-inset',
                  active ? 'text-brand-ink' : 'text-muted-foreground'
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
