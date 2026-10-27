import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ActiveTabItem } from './ActiveTabItem';
import type { ViewNavItem } from './ViewNav';

interface ViewTabsProps {
  items: readonly ViewNavItem[];
  activeValue: string;
  ariaLabel: string;
  /**
   * `primary`: fila de pestañas subrayadas (primer nivel dentro de una página).
   * `secondary`: control segmentado más chico, para un segundo nivel dentro de una pestaña.
   */
  level: 'primary' | 'secondary';
}

function isItemActive(item: ViewNavItem, activeValue: string) {
  return item.value === activeValue || (item.aliases?.includes(activeValue) ?? false);
}

/**
 * Pestañas horizontales de una página (Configuración). Son ENLACES del servidor (`<nav>` +
 * `aria-current`), no un `tablist`: cada pestaña es una URL (`?subtab=…`) que se puede compartir y
 * que conserva los enlaces viejos vía `aliases`.
 *
 * En pantallas angostas la fila se desplaza en horizontal; el degradado del borde avisa que hay más
 * pestañas fuera de la vista (solo aparece cuando la fila realmente desborda: es una máscara sobre
 * el contenido desplazable). La pestaña activa se centra sola en la fila (`ActiveTabItem`).
 */
export function ViewTabs({ items, activeValue, ariaLabel, level }: ViewTabsProps) {
  const primary = level === 'primary';

  return (
    <nav aria-label={ariaLabel} className="min-w-0">
      <ul
        className={cn(
          'flex min-w-0 snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // Avisa con un degradado en los bordes cuando hay pestañas fuera de la vista.
          '[mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-1.5rem),transparent)]',
          primary ? 'gap-1' : 'bg-muted w-fit max-w-full gap-0.5 rounded-lg p-1'
        )}
      >
        {items.map((item) => {
          const isActive = isItemActive(item, activeValue);
          const itemClassName = 'shrink-0 snap-start first:ps-0.5 last:pe-4';
          const link = (
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              title={item.description}
              className={cn(
                'focus-visible:ring-ring flex items-center gap-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset',
                primary
                  ? cn(
                      'relative min-h-11 rounded-t-md px-3 font-medium transition-colors',
                      'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full',
                      isActive
                        ? 'text-foreground after:bg-brand'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/60 after:bg-transparent'
                    )
                  : cn(
                      'min-h-9 rounded-md px-3 transition-colors',
                      isActive
                        ? 'bg-background text-foreground font-medium shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )
              )}
            >
              {item.label}
              {item.counter}
            </Link>
          );
          // La activa se centra en la fila si queda fuera de la vista (móvil); las demás quedan en el servidor.
          return isActive ? (
            <ActiveTabItem key={item.value} className={itemClassName}>
              {link}
            </ActiveTabItem>
          ) : (
            <li key={item.value} className={itemClassName}>
              {link}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
