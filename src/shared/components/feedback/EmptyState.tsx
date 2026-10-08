import { CircleAlert, Inbox, SearchX, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type EmptyStateVariant = 'empty' | 'filtered' | 'error';
type EmptyStateSize = 'default' | 'compact';

interface EmptyStateProps {
  /** `empty`: no hay datos · `filtered`: los filtros dejaron cero · `error`: falló la carga. */
  variant?: EmptyStateVariant;
  title: string;
  /** Por qué está vacío: la condición real que deja la lista en cero, no una afirmación optimista. */
  description: string;
  /** Por defecto, uno por variante (Inbox / SearchX / CircleAlert). */
  icon?: LucideIcon;
  /** Como máximo UNA acción (Button o Link del consumidor, `type="button"` si es botón). */
  action?: React.ReactNode;
  /** `default`: cuerpo de tabla o panel (240px mínimo) · `compact`: dentro de dialogs y listas. */
  size?: EmptyStateSize;
  className?: string;
}

const DEFAULT_ICONS: Record<EmptyStateVariant, LucideIcon> = {
  empty: Inbox,
  filtered: SearchX,
  error: CircleAlert,
};

const ICON_TONE: Record<EmptyStateVariant, string> = {
  empty: 'text-muted-foreground',
  filtered: 'text-muted-foreground',
  error: 'text-danger',
};

const SIZE_CLASSES: Record<EmptyStateSize, string> = {
  default: 'min-h-60 px-4 py-8',
  compact: 'py-6',
};

/**
 * Estado vacío (`DISENO.md` §4.11): alineado a la izquierda, sin ilustración, una sola acción.
 *
 * `variant="error"` se anuncia (`role="alert"`); las otras dos no, porque no son cambios urgentes.
 * `filtered` no trae texto por defecto: el consumidor pasa el título ("Sin resultados para los
 * filtros aplicados") y la acción "Limpiar filtros".
 *
 * Server Component (sin hooks): se puede usar desde páginas server y desde client components.
 */
export function EmptyState({
  variant = 'empty',
  title,
  description,
  icon,
  action,
  size = 'default',
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICONS[variant];

  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      role={variant === 'error' ? 'alert' : undefined}
      className={cn('flex flex-col items-start justify-center gap-3', SIZE_CLASSES[size], className)}
    >
      <div className="flex size-9 shrink-0 items-center justify-center border border-border bg-panel-2">
        <Icon aria-hidden="true" strokeWidth={1.75} className={cn('size-5', ICON_TONE[variant])} />
      </div>
      <div className="space-y-1">
        <p className="text-section text-foreground">{title}</p>
        <p className="max-w-prose text-body text-pretty text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export type { EmptyStateProps, EmptyStateSize, EmptyStateVariant };
