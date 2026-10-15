import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, Lock, type LucideIcon } from 'lucide-react';
import * as React from 'react';

export type StateBlockVariant = 'empty' | 'error' | 'noperm';

const DEFAULT_ICONS: Record<StateBlockVariant, LucideIcon> = {
  empty: Inbox,
  error: AlertCircle,
  noperm: Lock,
};

const ICON_STYLES: Record<StateBlockVariant, string> = {
  empty: 'bg-muted text-muted-foreground',
  error: 'bg-danger-subtle text-danger-subtle-foreground',
  noperm: 'bg-warn-subtle text-warn-subtle-foreground',
};

interface StateBlockProps {
  variant: StateBlockVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

/** Bloque de estado para vacío, error o falta de permiso. El error se anuncia con `role="alert"`. */
export function StateBlock({ variant, title, description, action, icon, className }: StateBlockProps) {
  const Icon = icon ?? DEFAULT_ICONS[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : undefined}
      className={cn('flex flex-col items-center justify-center gap-3 px-4 py-10 text-center', className)}
    >
      <span className={cn('flex size-10 items-center justify-center rounded-full', ICON_STYLES[variant])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? <p className="text-muted-foreground max-w-prose text-sm">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
