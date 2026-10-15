import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DisclosureMenu } from './DisclosureMenu';

export interface SectionNavItem {
  value: string;
  label: ReactNode;
  /** Contador de la sección (normalmente un Server Component dentro de su propio `<Suspense>`). */
  counter?: ReactNode;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Dato corto al lado del título (ej. cantidad de registros). */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Secciones del módulo: bajo `md` (sin sidebar) se ofrecen como selector desplegable. */
  sections?: { items: SectionNavItem[]; activeValue: string; paramName: string };
}

/**
 * Encabezado de página: título, dato `meta`, descripción y acciones. Si recibe más de una
 * sección, bajo `md` suma un selector (`<details>`) para cambiar de sección, porque ahí el
 * sidebar está oculto. Server Component: sin estado propio.
 */
export function PageHeader({ title, description, meta, actions, sections }: PageHeaderProps) {
  const showSections = sections && sections.items.length > 1;
  const activeItem = showSections ? sections.items.find((item) => item.value === sections.activeValue) : undefined;

  return (
    <header className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
            {meta ? <span className="text-muted-foreground text-sm tabular-nums">{meta}</span> : null}
          </div>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {showSections && activeItem ? (
        <DisclosureMenu
          className="group relative md:hidden"
          summaryLabel={`Sección actual: ${typeof activeItem.label === 'string' ? activeItem.label : sections.activeValue}`}
          summaryClassName="focus-visible:ring-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
          summary={
            <>
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">Sección: </span>
                <span className="font-medium">{activeItem.label}</span>
              </span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </>
          }
          panelClassName="bg-popover absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-md border p-1 shadow-md"
        >
          <ul>
            {sections.items.map((item) => {
              const isActive = item.value === sections.activeValue;
              return (
                <li key={item.value}>
                  <Link
                    href={`?${sections.paramName}=${encodeURIComponent(item.value)}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'focus-visible:ring-ring flex min-h-10 items-center justify-between gap-2 rounded-md px-3 text-sm outline-none focus-visible:ring-2',
                      isActive ? 'bg-brand-subtle text-brand-subtle-foreground font-medium' : 'hover:bg-accent'
                    )}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.counter}
                  </Link>
                </li>
              );
            })}
          </ul>
        </DisclosureMenu>
      ) : null}
    </header>
  );
}
