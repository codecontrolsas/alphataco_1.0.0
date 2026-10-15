'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface StatItem {
  label: string;
  value: number;
  icon?: LucideIcon;
  /** Con `onClick` la cifra es un botón que abre el listado. */
  onClick?: () => void;
  /** Cómo se calcula la cifra; se muestra en un tooltip accesible por teclado. */
  description?: string;
}

interface IndicatorStatsProps {
  items: StatItem[];
  className?: string;
}

export function IndicatorStats({ items, className }: IndicatorStatsProps) {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            <span className="text-xl font-bold tabular-nums">{item.value.toLocaleString('es-AR')}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{item.label}</span>
          </>
        );

        return (
          <div key={item.label} className="relative flex min-w-0">
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                aria-label={`${item.label}: ${item.value.toLocaleString('es-AR')}. Ver listado`}
                className="flex w-full flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors hover:border-primary/20 hover:bg-muted/50 focus-visible:ring-ring outline-none focus-visible:ring-2"
              >
                {body}
              </button>
            ) : (
              <div className="flex w-full flex-col items-center gap-1 rounded-lg border p-3 text-center">{body}</div>
            )}
            {item.description && (
              <span className="absolute top-0.5 right-0.5">
                <InfoTip label={`Cómo se calcula «${item.label}»`}>{item.description}</InfoTip>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
