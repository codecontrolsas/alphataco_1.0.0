'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface DataTableActiveFilterChipProps {
  /** Título del filtro u orden ("Estado", "Orden"). Se muestra en muted con ":". */
  label: string;
  /** Valor ya formateado ("Activo", "12/08–30/09", "Fecha ↓"). Sin valor, el título va sin ":" (ej. "Orden (2)"). */
  value?: React.ReactNode;
  /** Texto plano del valor, para el `title` cuando el valor se trunca. */
  valueTitle?: string;
  /** Valores extra además del primero ("+2"). */
  extraCount?: number;
  /** Quita el filtro. */
  onRemove: () => void;
  /** Nombre accesible de la ✕ ("Quitar filtro Estado"). */
  removeLabel: string;
  /** Si se pasa, el cuerpo del chip es un botón (abre el popover del filtro). */
  onOpen?: () => void;
  /** Ancho máximo del valor antes de truncar. */
  className?: string;
  'data-testid'?: string;
  /** testid de la ✕ (el chip de orden conserva `clear-sorting` ahí). */
  removeTestId?: string;
}

const CHIP_BASE =
  'inline-flex h-7 max-w-full shrink-0 items-stretch border border-input bg-card text-caption whitespace-nowrap pointer-coarse:h-11';
const BODY_BASE = 'flex min-w-0 items-center gap-1 px-2';

/**
 * Chip de un filtro u orden activo: `Título: valor +2  ✕`.
 *
 * Es solo presentación: no sabe de URL ni de tabla. Lo usa el chip de orden de la toolbar y queda
 * disponible para los filtros (variante `chip`). La ✕ tiene 44px de área táctil con `pointer: coarse`.
 */
export function DataTableActiveFilterChip({
  label,
  value,
  valueTitle,
  extraCount = 0,
  onRemove,
  removeLabel,
  onOpen,
  className,
  removeTestId,
  'data-testid': dataTestId,
}: DataTableActiveFilterChipProps) {
  const content = (
    <>
      <span className="text-muted-foreground">{value != null ? `${label}:` : label}</span>
      {value != null && (
        <span className="text-foreground max-w-[16ch] truncate" title={valueTitle}>
          {value}
        </span>
      )}
      {extraCount > 0 && <span className="text-muted-foreground tabular-nums">+{extraCount}</span>}
    </>
  );

  return (
    <span className={cn(CHIP_BASE, className)} data-testid={dataTestId}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={cn(BODY_BASE, 'hover:bg-accent')}>
          {content}
        </button>
      ) : (
        <span className={BODY_BASE}>{content}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        data-testid={removeTestId}
        className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex w-6 items-center justify-center border-l border-input pointer-coarse:min-w-11"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}
