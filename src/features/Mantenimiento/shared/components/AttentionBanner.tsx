import { cn } from '@/lib/utils';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type AttentionTone = 'warn' | 'danger' | 'info' | 'ok';

const TONE_STYLES: Record<AttentionTone, string> = {
  warn: 'border-warn/35 bg-warn-subtle text-warn-subtle-foreground',
  danger: 'border-danger/30 bg-danger-subtle text-danger-subtle-foreground',
  info: 'border-brand/30 bg-brand-subtle text-brand-subtle-foreground',
  ok: 'border-ok/30 bg-ok-subtle text-ok-subtle-foreground',
};

const TONE_ICONS: Record<AttentionTone, LucideIcon> = {
  warn: AlertTriangle,
  danger: AlertOctagon,
  info: Info,
  ok: CheckCircle2,
};

interface AttentionBannerProps {
  tone: AttentionTone;
  title: ReactNode;
  description?: ReactNode;
  /** Botones de acción; los arma quien llama (con `type="button"`). */
  actions?: ReactNode;
  /** Banda que cambia mientras se mira (contadores en vivo): se anuncia como `status` en vez de `note`. */
  live?: boolean;
}

/**
 * Banda de atención sobre una tabla. Sin título no hay nada que avisar y no se renderiza: no existe la
 * banda vacía. En móvil las acciones bajan a una fila propia.
 */
export function AttentionBanner({ tone, title, description, actions, live = false }: AttentionBannerProps) {
  if (title === null || title === undefined || title === false || title === '') return null;

  const Icon = TONE_ICONS[tone];

  return (
    <div
      role={live ? 'status' : 'note'}
      className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3', TONE_STYLES[tone])}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm opacity-90">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 max-sm:w-full sm:ml-auto">{actions}</div> : null}
    </div>
  );
}
