'use client';

import { ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FilterTriggerButtonProps {
  title: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * Trigger de un filtro inactivo: botón secundario con título y chevron.
 * Debe renderizarse dentro de un `<Popover>`.
 */
export function FilterTriggerButton({ title, disabled, testId }: FilterTriggerButtonProps) {
  return (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled}
        data-testid={testId}
      >
        {title}
        <ChevronDown className="size-3" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
  );
}

interface FilterChipProps {
  title: string;
  /** Valor visible ya resuelto (se trunca a ~16ch). */
  value: ReactNode;
  /** Valores extra no mostrados ("+2"). */
  extraCount?: number;
  /** `title` nativo con el valor completo (el visible se trunca). */
  valueTitle?: string;
  onClear: () => void;
  disabled?: boolean;
  testId?: string;
  clearTestId?: string;
  /** Muestra `skeleton` en lugar del valor (opciones aún sin cargar). */
  loading?: boolean;
  skeleton?: ReactNode;
}

/**
 * Chip de un filtro activo: `Título: valor +n` (abre el popover) y una ✕ que lo limpia.
 * Debe renderizarse dentro de un `<Popover>`; la ✕ queda fuera del trigger.
 */
export function FilterChip({
  title,
  value,
  extraCount,
  valueTitle,
  onClear,
  disabled,
  testId,
  clearTestId,
  loading,
  skeleton,
}: FilterChipProps) {
  return (
    <div
      className={cn(
        'inline-flex h-7 items-center border border-input bg-card text-caption whitespace-nowrap pointer-coarse:h-11',
        disabled && 'opacity-50'
      )}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId}
          className="inline-flex h-full items-center gap-1 px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-muted-foreground">{title}:</span>
          {loading ? (
            skeleton
          ) : (
            <span className="max-w-[16ch] truncate text-foreground" title={valueTitle}>
              {value}
            </span>
          )}
          {extraCount ? <span className="tabular-nums text-muted-foreground">+{extraCount}</span> : null}
        </button>
      </PopoverTrigger>
      <button
        type="button"
        aria-label={`Quitar filtro ${title}`}
        disabled={disabled}
        onClick={onClear}
        data-testid={clearTestId}
        className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}
