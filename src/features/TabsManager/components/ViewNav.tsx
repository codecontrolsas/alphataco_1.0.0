import { cn } from '@/lib/utils';
import { DisclosureMenu } from '@/shared/components/common/DisclosureMenu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface ViewNavItem {
  value: string;
  label: string;
  description?: string;
  counter?: ReactNode;
  href: string;
  /** Otros valores de URL que también marcan esta vista como activa. */
  aliases?: string[];
}

interface ViewNavProps {
  items: readonly ViewNavItem[];
  activeValue: string;
  ariaLabel: string;
  layout: 'rail' | 'menu';
  /** Rótulo antes del valor activo en el selector (default «Vista»). */
  menuPrefix?: string;
}

function isItemActive(item: ViewNavItem, activeValue: string) {
  return item.value === activeValue || (item.aliases?.includes(activeValue) ?? false);
}

function ViewMenu({
  items,
  activeValue,
  ariaLabel,
  className,
  menuPrefix = 'Vista',
}: Omit<ViewNavProps, 'layout'> & { className?: string }) {
  const active = items.find((item) => isItemActive(item, activeValue)) ?? items[0];

  return (
    <DisclosureMenu
      className={cn('group relative', className)}
      summaryLabel={`${ariaLabel}: ${active.label}`}
      summaryClassName="focus-visible:ring-ring flex min-h-10 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 sm:w-80 [&::-webkit-details-marker]:hidden"
      summary={
        <>
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground">{menuPrefix}:</span>
            <b className="min-w-0 truncate font-medium">{active.label}</b>
            {active.counter}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </>
      }
      // z-50 como los popovers: el contenido de la vista usa capas propias (las columnas fijas de la
      // grilla de Diagramas llegan a z-30) y con menos el desplegable quedaba debajo.
      panelClassName="bg-popover absolute left-0 top-full z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border p-1 shadow-md sm:w-80"
    >
      <ul>
        {items.map((item) => {
          const isActive = item.value === active.value;
          return (
            <li key={item.value}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex min-h-10 items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2',
                  isActive ? 'bg-brand-subtle text-brand-subtle-foreground' : 'hover:bg-accent'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="text-muted-foreground block truncate text-xs">{item.description}</span>
                  ) : null}
                </span>
                {item.counter}
              </Link>
            </li>
          );
        })}
      </ul>
    </DisclosureMenu>
  );
}

/**
 * Navegación entre vistas de una misma sección. No es una fila de pestañas: `menu` es un
 * selector desplegable; `rail` es una columna lateral desde `2xl` (1536 px: debajo le quitaría ancho a gráficos pensados para la página completa) y el mismo selector debajo.
 */
export function ViewNav({ items, activeValue, ariaLabel, layout, menuPrefix }: ViewNavProps) {
  if (layout === 'menu') {
    return <ViewMenu items={items} activeValue={activeValue} ariaLabel={ariaLabel} menuPrefix={menuPrefix} />;
  }

  return (
    <>
      <ViewMenu items={items} activeValue={activeValue} ariaLabel={ariaLabel} className="2xl:hidden" />
      <nav aria-label={ariaLabel} className="hidden w-56 shrink-0 2xl:block">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isActive = isItemActive(item, activeValue);
            return (
              <li key={item.value}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-10 items-center justify-between gap-3 border-l-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-2',
                    isActive
                      ? 'border-brand bg-brand-subtle text-brand-subtle-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground border-transparent'
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn('block truncate font-medium', isActive ? '' : 'text-foreground')}>
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="text-muted-foreground block truncate text-xs">{item.description}</span>
                    ) : null}
                  </span>
                  {item.counter}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
