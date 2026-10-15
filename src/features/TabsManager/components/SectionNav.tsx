import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionNavItem {
  value: string;
  label: ReactNode;
  /** Contador de la sección (normalmente un Server Component dentro de su propio `<Suspense>`). */
  counter?: ReactNode;
}

interface SectionNavProps {
  paramName: string;
  items: readonly SectionNavItem[];
  activeValue: string;
  ariaLabel: string;
}

/**
 * Sub-navegación de secciones con contadores (opt-in vía `sectionNav` de `SectionManagerServer`).
 *
 * Es una lista de enlaces `?<param>=<valor>`: la sección activa se resuelve en el servidor y las
 * inactivas no renderizan su contenido. En pantallas angostas la lista se desplaza en horizontal
 * dentro de su propio contenedor, sin ensanchar la página.
 */
export function SectionNav({ paramName, items, activeValue, ariaLabel }: SectionNavProps) {
  return (
    <nav aria-label={ariaLabel} className="min-w-0 max-w-full">
      <ul className="flex min-w-0 gap-1 overflow-x-auto border-b pb-px">
        {items.map((item) => {
          const isActive = item.value === activeValue;
          return (
            <li key={item.value} className="shrink-0">
              <Link
                href={`?${paramName}=${encodeURIComponent(item.value)}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground border-transparent'
                )}
              >
                {item.label}
                {item.counter}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
