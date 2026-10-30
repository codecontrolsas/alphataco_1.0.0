import { cn } from '@/lib/utils';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Error de carga o de acción con la salida (reintentar, volver). El título dice qué pasó, no "Error". */
export function ErrorState({
  title,
  description,
  actions,
  headingLevel = 'h2',
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 'h1' | 'h2';
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div className={cn('bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center', className)}>
      <span
        aria-hidden="true"
        className="bg-danger-subtle text-danger-subtle-foreground flex size-11 items-center justify-center rounded-full"
      >
        <CircleAlert className="size-5" />
      </span>
      <div className="max-w-sm space-y-1">
        <Heading className="text-lg font-semibold text-balance">{title}</Heading>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
