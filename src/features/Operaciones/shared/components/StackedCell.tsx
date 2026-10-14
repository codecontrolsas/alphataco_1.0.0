import { cn } from '@/lib/utils';
import * as React from 'react';

interface StackedCellProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Muestra el texto principal en tipografía mono (identificadores, números). */
  mono?: boolean;
  /** Clase de ancho máximo escrita completa (ej. `max-w-[220px]`) para truncar. */
  maxWidthClass?: string;
  className?: string;
}

/** Celda de dos líneas: dato principal arriba y apoyo debajo, ambos truncados con `title`. */
export function StackedCell({ primary, secondary, mono = false, maxWidthClass = 'max-w-[220px]', className }: StackedCellProps) {
  const primaryTitle = typeof primary === 'string' || typeof primary === 'number' ? String(primary) : undefined;
  const secondaryTitle = typeof secondary === 'string' || typeof secondary === 'number' ? String(secondary) : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col', maxWidthClass, className)}>
      <span title={primaryTitle} className={cn('text-foreground truncate text-sm font-medium', mono && 'font-mono tabular-nums')}>
        {primary}
      </span>
      {secondary != null && secondary !== '' ? (
        <span title={secondaryTitle} className="text-muted-foreground truncate text-xs">
          {secondary}
        </span>
      ) : null}
    </div>
  );
}
