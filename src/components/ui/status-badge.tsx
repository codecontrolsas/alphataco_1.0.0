import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import {
  statusIconMap,
  statusLabelMap,
  statusToneMap,
  type StatusDomain,
  type StatusOf,
  type StatusTone,
} from '@/shared/utils/mappers';

// Sin directiva: se renderiza en el servidor si el padre es server, y en el cliente si el padre es client.

const logger = new Logger('StatusBadge');

// Clases escritas completas (Tailwind v4 solo emite las clases que aparecen literales en el código).
const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-success-border bg-success-soft text-success-text',
  warning: 'border-warning-border bg-warning-soft text-warning-text',
  danger: 'border-danger-border bg-danger-soft text-danger-text',
  info: 'border-info-border bg-info-soft text-info-text',
  neutral: 'border-neutral-border bg-neutral-soft text-neutral-text',
  brand: 'border-primary/30 bg-primary-soft text-primary-text',
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
  brand: 'bg-primary',
};

type StatusBadgeProps = {
  tone: StatusTone;
  /** Texto del estado: obligatorio (un estado nunca se comunica solo con color). */
  children: React.ReactNode;
  /** Ícono Lucide o el punto de color. Default `'dot'`. */
  icon?: LucideIcon | 'dot';
  className?: string;
};

/**
 * Badge de estado con tono semántico. Para estados de un enum de la BD usar `DomainStatusBadge`
 * (tono, label e ícono salen del mapa único de `mappers.ts`); `StatusBadge tone=` queda para estados que no son
 * de un enum ("Vence en 3 días", conteos).
 */
function StatusBadge({ tone, children, icon = 'dot', className }: StatusBadgeProps) {
  const Icon = icon === 'dot' ? null : icon;
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      title={typeof children === 'string' ? children : undefined}
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 border px-1.5 text-caption font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className
      )}
    >
      {Icon ? (
        <Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : (
        <span className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[tone])} aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

// Vistas ensanchadas de los mapas para indexarlos con un dominio genérico.
const TONES_BY_DOMAIN: Record<StatusDomain, Partial<Record<string, StatusTone>>> = statusToneMap;
const LABELS_BY_DOMAIN: Record<StatusDomain, Partial<Record<string, string>>> = statusLabelMap;
const ICONS_BY_DOMAIN: Partial<Record<StatusDomain, Partial<Record<string, LucideIcon>>>> = statusIconMap;

const UNDERSCORES = /_/g;

// Avisa una sola vez por dominio/estado desconocido (dedup de logs, no estado de request).
const warnedUnknownStatuses = new Set<string>();

function warnUnknownStatus(domain: StatusDomain, status: string) {
  if (process.env.NODE_ENV === 'production') return;
  const key = `${domain}:${status}`;
  if (warnedUnknownStatuses.has(key)) return;
  warnedUnknownStatuses.add(key);
  logger.warn('Estado sin tono en statusToneMap', { data: { domain, status } });
}

type DomainStatusBadgeProps<D extends StatusDomain> = {
  domain: D;
  /** Valor crudo del enum. `null` se muestra como "—" en tono neutral. */
  status: StatusOf<D> | null;
  className?: string;
};

/** Badge de un estado de enum: tono, label e ícono salen de `statusToneMap` / `statusLabelMap` / `statusIconMap`. */
function DomainStatusBadge<D extends StatusDomain>({ domain, status, className }: DomainStatusBadgeProps<D>) {
  if (status === null) {
    return (
      <StatusBadge tone="neutral" className={className}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin estado</span>
      </StatusBadge>
    );
  }

  const key = String(status);
  const tone = TONES_BY_DOMAIN[domain][key];
  if (!tone) {
    // Valor que el mapa no conoce: se muestra crudo y neutral, nunca se oculta.
    warnUnknownStatus(domain, key);
    return (
      <StatusBadge tone="neutral" className={className}>
        {key}
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone={tone} icon={ICONS_BY_DOMAIN[domain]?.[key] ?? 'dot'} className={className}>
      {LABELS_BY_DOMAIN[domain][key] ?? key.replace(UNDERSCORES, ' ')}
    </StatusBadge>
  );
}

export { DomainStatusBadge, StatusBadge, type DomainStatusBadgeProps, type StatusBadgeProps, type StatusTone };
