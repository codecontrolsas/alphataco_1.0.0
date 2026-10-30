import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Encabezado de página del portal: migas (en el celular, solo "volver" al nivel anterior), estado opcional, título
 * (el único `<h1>` de la página), descripción y acciones. Lo usan todas las pantallas para que la jerarquía sea la
 * misma en cada sección.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  status,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Niveles ANTERIORES a esta página (la página actual no va: es el título). */
  breadcrumbs?: Crumb[];
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const parent = breadcrumbs?.filter((c) => c.href).at(-1);
  return (
    <header className={cn('mb-6 space-y-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Ubicación">
          {parent?.href && (
            <Link
              href={parent.href}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm outline-none focus-visible:ring-2 sm:hidden"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              {parent.label}
            </Link>
          )}
          <ol className="text-muted-foreground hidden flex-wrap items-center gap-1 text-sm sm:flex">
            {breadcrumbs.map((crumb) => (
              <li key={`${crumb.label}-${crumb.href ?? ''}`} className="flex min-w-0 items-center gap-1">
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground focus-visible:ring-ring max-w-[16rem] truncate rounded-sm outline-none focus-visible:ring-2"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="max-w-[16rem] truncate">{crumb.label}</span>
                )}
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {status}
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words sm:text-[1.75rem] sm:leading-tight">
            {title}
          </h1>
          {description && <p className="text-muted-foreground max-w-prose text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
