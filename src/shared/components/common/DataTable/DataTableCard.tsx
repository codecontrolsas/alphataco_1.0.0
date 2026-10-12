'use client';

import type { Row } from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import { DataTableDetailActions, DataTableDetailBody, getRowTitleText, renderRowCell } from './DataTableDetailSheet';
import type { MobileLayout } from './types';

// Elementos que conservan su propio comportamiento y no abren el detalle al tocar la tarjeta.
const INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,label,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="combobox"],[role="menuitem"]';

export interface DataTableCardProps<TData> {
  row: Row<TData>;
  layout: MobileLayout<TData>;
  isSelected: boolean;
  /** La tabla tiene selección visible (columna `select` presente). */
  selectable: boolean;
  /** Clases del `rowClassName` del consumidor, ya resueltas. */
  extraClassName?: string;
  onOpenDetail: (rowId: string) => void;
}

/** Tarjeta de una fila en modo mobile (§3.5.1). A nivel de módulo y con `memo`: no se redefine por render. */
function DataTableCardComponent<TData>({
  row,
  layout,
  isSelected,
  selectable,
  extraClassName,
  onOpenDetail,
}: DataTableCardProps<TData>) {
  const [expanded, setExpanded] = useState(false);
  const titleText = getRowTitleText(row, layout);
  const canSelect = row.getCanSelect();

  // Dentro de un dialog no se encadenan modales: el detalle se expande en la tarjeta.
  function openDetail(origin: HTMLElement) {
    if (origin.closest('[role="dialog"]')) {
      setExpanded((value) => !value);
      return;
    }
    onOpenDetail(row.id);
  }

  return (
    <li
      data-testid={`table-card-${row.id}`}
      data-state={isSelected ? 'selected' : undefined}
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;
        openDetail(event.currentTarget);
      }}
      className={cn(
        'relative grid touch-manipulation grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 [contain-intrinsic-size:auto_120px] [content-visibility:auto] active:bg-accent',
        isSelected && 'bg-primary-soft shadow-[inset_2px_0_0_var(--primary)]',
        extraClassName
      )}
    >
      {selectable ? (
        <Checkbox
          checked={isSelected}
          disabled={!canSelect}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          aria-label={`Seleccionar «${titleText}»`}
          className="col-start-1 row-start-1 mt-0.5 self-start"
        />
      ) : null}

      <div
        className={cn(
          'text-body flex min-w-0 flex-wrap items-baseline gap-x-2 font-medium',
          selectable ? 'col-start-2' : 'col-start-1 col-span-2'
        )}
      >
        {/* El primer título suele ser un código (legajo, Nº de pedido): no se parte, y si es un texto largo (tabla sin
            anotar) se trunca en vez de desbordar la tarjeta; el segundo pasa abajo si no entra. */}
        {layout.titles.map((entry, index) => (
          <span
            key={entry.column.id}
            className={index === 0 ? 'max-w-full truncate' : 'min-w-0 line-clamp-2 break-words'}
          >
            {renderRowCell(row, entry.column.id)}
          </span>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Ver detalle de «${titleText}»`}
        aria-haspopup="dialog"
        aria-expanded={expanded ? true : undefined}
        onClick={(event) => openDetail(event.currentTarget)}
        className="col-start-3 row-start-1 -my-1 -mr-2"
      >
        <ChevronRight aria-hidden="true" className={cn('transition-transform', expanded && 'rotate-90')} />
      </Button>

      {layout.status || layout.subtitle ? (
        <div
          className={cn(
            'text-caption text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
            selectable ? 'col-start-2 col-span-2' : 'col-start-1 col-span-3'
          )}
        >
          {layout.status ? <span className="shrink-0">{renderRowCell(row, layout.status.column.id)}</span> : null}
          {layout.subtitle ? (
            <span className="min-w-0 truncate">{renderRowCell(row, layout.subtitle.column.id)}</span>
          ) : null}
        </div>
      ) : null}

      {layout.fields.length > 0 ? (
        <dl
          className={cn(
            'grid grid-cols-2 gap-x-4 gap-y-1',
            selectable ? 'col-start-2 col-span-2' : 'col-start-1 col-span-3'
          )}
        >
          {layout.fields.map((entry) => (
            <div key={entry.column.id} className="min-w-0">
              <dt className={cn('text-caption text-muted-foreground truncate', entry.hideLabel && 'sr-only')}>
                {entry.label}
              </dt>
              <dd className="text-cell min-w-0 break-words">{renderRowCell(row, entry.column.id)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {expanded ? (
        <div
          className={cn(
            'border-border mt-2 flex flex-col gap-3 border-t pt-3',
            selectable ? 'col-start-2 col-span-2' : 'col-start-1 col-span-3'
          )}
        >
          <DataTableDetailBody row={row} layout={layout} />
          {layout.actions ? (
            <div className="flex flex-wrap items-center gap-2">
              <DataTableDetailActions row={row} layout={layout} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export const DataTableCard = memo(DataTableCardComponent) as typeof DataTableCardComponent;
