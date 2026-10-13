import { cn } from '@/lib/utils';
import * as React from 'react';

interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Sin relleno en el cuerpo: para tablas o listas que van a sangre. */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Contenedor de sección con borde (la profundidad es solo de bordes) y cabecera opcional con
 * título, descripción y una acción a la derecha.
 */
export function SectionCard({ title, description, action, flush = false, children, className }: SectionCardProps) {
  return (
    <section className={cn('bg-card rounded-xl border', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-semibold">{title}</h2>}
            {description && <p className="text-muted-foreground text-sm text-balance">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn(!flush && 'p-5')}>{children}</div>
    </section>
  );
}
