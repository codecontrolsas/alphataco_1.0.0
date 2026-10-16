import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface LoadSectionProps {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Sección numerada de un formulario de carga: el número y el título guían el orden en que se completa. */
export function LoadSection({ step, title, description, children, className }: LoadSectionProps) {
  const headingId = `load-section-${step}`;

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-brand-subtle text-brand-subtle-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm leading-6 font-semibold">
            {title}
          </h3>
          {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
        </div>
      </div>
      <div className="min-w-0 sm:pl-9">{children}</div>
    </section>
  );
}
