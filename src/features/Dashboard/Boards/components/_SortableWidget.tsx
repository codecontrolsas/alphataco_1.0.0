'use client';

import { Button } from '@/components/ui/button';
import { WIDGET_SIZE_LABELS, sizeIndex, type WidgetSize } from '@/features/Dashboard/lib/widget-registry';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Minus, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { WIDGET_SPAN_CLASS } from '../lib/board-layout';
import type { CatalogWidget } from './_DashboardBoard';

/** Ancho en pocas letras para la barra de edición (el rótulo completo es `WIDGET_SIZE_LABELS`). */
const WIDGET_SIZE_SHORT_LABELS: Record<WidgetSize, string> = {
  xs: '1/6',
  sm: '1/4',
  md: '1/3',
  lg: '1/2',
  xl: '2/3',
  full: 'Todo',
};

interface SortableWidgetProps {
  widget: CatalogWidget;
  size: WidgetSize;
  node: ReactNode | undefined;
  onResize: (delta: 1 | -1) => void;
  onRemove: () => void;
  disabled: boolean;
}

/** Widget en modo edición: asa para arrastrar, control de ancho y quitar; el contenido queda inerte. */
export function SortableWidget({ widget, size, node, onResize, onRemove, disabled }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled,
  });
  const index = sizeIndex(size);
  const canShrink = index > sizeIndex(widget.minSize);
  const canGrow = index < sizeIndex(widget.maxSize);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(WIDGET_SPAN_CLASS[size], 'min-w-0', isDragging && 'relative z-10')}
    >
      <div
        className={cn(
          'bg-card flex h-full flex-col rounded-xl border-2 border-dashed',
          isDragging ? 'border-brand shadow-lg' : 'border-border'
        )}
      >
        <div className="@container flex flex-col gap-1 border-b px-2 py-1.5">
          {/* En un widget angosto (1/6, 1/4) el título baja a su propia línea en vez de cortarse. */}
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Mover «${widget.title}»`}
              className="text-muted-foreground hover:bg-accent focus-visible:ring-ring flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-2 active:cursor-grabbing"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
            <span
              className="order-last line-clamp-2 w-full min-w-0 px-1 text-sm leading-tight font-medium @3xs:order-none @3xs:w-auto @3xs:flex-1 @3xs:px-0"
              title={widget.title}
            >
              {widget.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-9 shrink-0 @3xs:ml-0"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Quitar «${widget.title}» del tablero`}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div className="@container flex items-center gap-1" role="group" aria-label={`Ancho de «${widget.title}»`}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onResize(-1)}
              disabled={disabled || !canShrink}
              aria-label={`Achicar «${widget.title}»`}
            >
              <Minus aria-hidden="true" className="size-3.5" />
            </Button>
            {/* Rótulo corto para que entre en los widgets angostos; el completo queda para lectores y al pasar el mouse. */}
            <span
              className="text-muted-foreground min-w-0 flex-1 truncate text-center text-xs tabular-nums"
              title={WIDGET_SIZE_LABELS[size]}
              aria-live="polite"
            >
              <span aria-hidden="true" className="@3xs:hidden">
                {WIDGET_SIZE_SHORT_LABELS[size]}
              </span>
              <span className="sr-only @3xs:not-sr-only">{WIDGET_SIZE_LABELS[size]}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onResize(1)}
              disabled={disabled || !canGrow}
              aria-label={`Agrandar «${widget.title}»`}
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </div>
        {/* Vista previa inerte y recortada: se puede arrastrar sin interactuar con el contenido. */}
        <div
          inert
          className="pointer-events-none relative max-h-72 min-h-24 overflow-hidden p-2 opacity-80 select-none"
        >
          {node ?? (
            <div className="text-muted-foreground flex h-24 flex-col items-center justify-center gap-1 text-center text-xs">
              <span className="text-foreground text-sm font-medium">{widget.title}</span>
              <span>{widget.description}</span>
              <span>Se muestra al guardar el tablero.</span>
            </div>
          )}
          <div
            aria-hidden="true"
            className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t"
          />
        </div>
      </div>
    </li>
  );
}
