import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import * as React from 'react';

export type TimelineTone = 'ok' | 'warn' | 'danger' | 'brand';

export interface TimelineItem {
  tone: TimelineTone;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Contenido opcional debajo del meta, fuera del `<p>` (admite bloques como `div` o `button`). */
  children?: React.ReactNode;
}

const DOT_STYLES: Record<TimelineTone, string> = {
  ok: 'bg-ok-subtle text-ok-subtle-foreground',
  warn: 'bg-warn-subtle text-warn-subtle-foreground',
  danger: 'bg-danger-subtle text-danger-subtle-foreground',
  brand: 'bg-brand-subtle text-brand-subtle-foreground',
};

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

/** Línea de tiempo vertical: punto con check coloreado por tono, título y meta (quién y cuándo). */
export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol className={cn('space-y-4', className)}>
      {items.map((item, index) => (
        <li key={index} className="relative flex gap-3">
          {index < items.length - 1 ? (
            <span className="bg-border absolute top-6 bottom-[-1rem] left-3 w-px" aria-hidden="true" />
          ) : null}
          <span className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-full', DOT_STYLES[item.tone])}>
            <Check className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-0.5 pt-0.5">
            <p className="text-foreground text-sm font-medium">{item.title}</p>
            {item.meta ? <p className="text-muted-foreground text-xs">{item.meta}</p> : null}
            {item.children}
          </div>
        </li>
      ))}
    </ol>
  );
}
