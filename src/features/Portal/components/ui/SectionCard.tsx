import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Bloque con título (`<h2>`), contador opcional y enlace "ver todo". `bare` deja el contenido sin tarjeta (para listas
 * que ya traen sus propias tarjetas).
 */
export function SectionCard({
  id,
  title,
  count,
  description,
  link,
  bare = false,
  className,
  children,
}: {
  /** Id del `<h2>` (la sección queda etiquetada por él). */
  id: string;
  title: string;
  count?: number;
  description?: ReactNode;
  link?: { href: string; label: string };
  bare?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <h2 id={id} className="text-base font-semibold">
            {title}
            {count !== undefined && (
              <>
                {' '}
                <span className="text-muted-foreground font-normal tabular-nums">({count})</span>
              </>
            )}
          </h2>
          {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
        </div>
        {link && (
          <Link
            href={link.href}
            className="text-brand-ink focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-2"
          >
            {link.label}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
      {bare ? children : <div className="bg-card rounded-xl border p-4">{children}</div>}
    </section>
  );
}
