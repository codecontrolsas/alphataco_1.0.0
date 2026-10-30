import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TONE_CLASSES = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-ok-subtle text-ok-subtle-foreground',
} as const;

/**
 * Estado vacío del portal. `tone="success"` es para "estás al día" (hubo algo y ya está hecho); `neutral` para "todavía
 * no hay nada". No se usa para ocultar un error: los errores van con `ErrorState`.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  compact = false,
  headingLevel = 'p',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: keyof typeof TONE_CLASSES;
  /** En línea (dentro de una tarjeta) en vez de bloque centrado. */
  compact?: boolean;
  headingLevel?: 'p' | 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        compact
          ? 'flex items-start gap-3'
          : 'flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className
      )}
    >
      <span
        className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', TONE_CLASSES[tone])}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className={cn('space-y-1', !compact && 'max-w-sm')}>
        <Heading className="font-medium text-balance">{title}</Heading>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
        {action && <div className={cn('pt-2', !compact && 'flex justify-center')}>{action}</div>}
      </div>
    </div>
  );
}
