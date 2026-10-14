import { cn } from '@/lib/utils';
import * as React from 'react';

export type MetricTone = 'default' | 'brand' | 'ok' | 'warn' | 'danger';

/** Fondo y texto de la tarjeta cuando pide atención (`brand`: esperando una decisión; `warn`/`danger`: pide acción). */
const TONE_STYLES: Record<MetricTone, string> = {
  default: '',
  ok: '',
  brand: 'border-brand/40 bg-brand-subtle text-brand-subtle-foreground',
  warn: 'border-warn/35 bg-warn-subtle text-warn-subtle-foreground',
  danger: 'border-danger/30 bg-danger-subtle text-danger-subtle-foreground',
};

interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: MetricTone;
  /** Con `onSelect` la tarjeta es un botón; `pressed` indica si su filtro está aplicado. */
  onSelect?: () => void;
  pressed?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * Tarjeta de métrica: rótulo en mayúsculas (lo que menos pesa), valor en mono (lo que lidera)
 * y una línea de apoyo. La reserva siempre, así los números de una misma fila quedan a la misma
 * altura aunque no todas las tarjetas tengan texto de apoyo.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
  onSelect,
  pressed,
  className,
  'data-testid': testId,
}: MetricCardProps) {
  const body = (
    <>
      <span className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{label}</span>
      <span className="space-y-1">
        <span className="block font-mono text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="block min-h-5 text-sm opacity-80">{hint}</span>
      </span>
    </>
  );

  const base = cn(
    'bg-card flex flex-col justify-between gap-3 rounded-xl border p-5 text-left transition-colors',
    TONE_STYLES[tone],
    tone !== 'default' && tone !== 'ok' && '[&_span:first-child]:text-current',
    className
  );

  if (!onSelect)
    return (
      <div className={base} data-testid={testId}>
        {body}
      </div>
    );

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      data-testid={testId}
      className={cn(
        base,
        'hover:border-brand/50 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
        pressed && 'border-brand ring-brand/25 ring-[3px]'
      )}
    >
      {body}
    </button>
  );
}
