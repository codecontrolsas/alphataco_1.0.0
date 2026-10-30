'use client';

import {
  isSectionActive,
  isTopLevelPath,
  sectionsFor,
  type PortalBadgeCounts,
} from '@/features/Portal/navigation/registry';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { NavBadge } from './NavBadge';

/**
 * Barra inferior del celular (debajo de `md`), con los destinos de primer nivel marcados `bottomNav` en el registro.
 *
 * Solo aparece en esas pantallas: en un detalle o un flujo (documento, capacitación, examen, resultado) la acción
 * principal va al pie de la página y una barra fija la taparía (pasaba con «Aceptar documento» a 390 px). Ahí se vuelve
 * con las migas o el menú de la cabecera.
 */
export function PortalBottomNav({ visibleIds, badges }: { visibleIds: string[]; badges: Promise<PortalBadgeCounts> }) {
  const pathname = usePathname();
  if (!isTopLevelPath(pathname)) return null;
  const items = sectionsFor(visibleIds).filter((s) => s.bottomNav);
  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Secciones principales"
      // `scroll-padding` del documento: lo enfocado nunca queda detrás de la barra (WCAG 2.4.11).
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden [html:has(&)]:scroll-pb-24"
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((section) => {
          const active = isSectionActive(pathname, section.href);
          const Icon = section.icon;
          return (
            <li key={section.id}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring relative flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 px-1 text-xs font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-inset',
                  active ? 'text-brand-ink' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                    active && 'bg-brand-subtle'
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="max-w-full truncate">{section.shortLabel ?? section.label}</span>
                {section.badge && (
                  <Suspense fallback={null}>
                    <NavBadge counts={badges} badgeKey={section.badge} variant="bottom" />
                  </Suspense>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
