'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Check, RotateCcw, Settings2, Undo2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

import type { DataTableViewOptionsProps } from './types';

/** Normaliza texto para buscar sin distinguir mayúsculas ni acentos */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtro de `Command` por título visible (llega como `keywords`), no por el id interno.
 * Devuelve 1 si coincide y 0 si no: sin ranking difuso, solo "contiene".
 */
export function matchSearchByTitle(value: string, search: string, keywords?: string[]): number {
  const needle = normalizeSearchText(search);
  if (!needle) return 1;
  const haystack = normalizeSearchText((keywords && keywords.length > 0 ? keywords : [value]).join(' '));
  return haystack.includes(needle) ? 1 : 0;
}

/** Título legible de la columna (el mismo que usan el toggle de columnas y el export a Excel) */
function getColumnTitle<TData>(column: Column<TData, unknown>): string {
  return (column.columnDef.meta as { title?: string })?.title || column.id;
}

/**
 * Columnas que el usuario puede mostrar/ocultar y, por lo tanto, tambien reordenar.
 * Quedan afuera las columnas de estructura (`select`, `actions`): no tienen `accessorFn`.
 */
function getMovableColumns<TData>(columns: Column<TData, unknown>[]): Column<TData, unknown>[] {
  return columns.filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide());
}

/** Clave del boton de movimiento de una fila, para poder devolverle el foco despues de reordenar */
function getMoveButtonKey(columnId: string, direction: -1 | 1): string {
  return `${columnId}:${direction === -1 ? 'up' : 'down'}`;
}

/**
 * Popover con buscador para mostrar/ocultar columnas.
 *
 * Con `enableColumnReorder` cada fila suma además los botones para moverla. Sin el flag,
 * es solo el selector de visibilidad (con buscador).
 *
 * @example
 * ```tsx
 * <DataTableViewOptions table={table} />
 * <DataTableViewOptions table={table} enableColumnReorder />
 * ```
 */
export function DataTableViewOptions<TData>({ table, enableColumnReorder = false }: DataTableViewOptionsProps<TData>) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [announcement, setAnnouncement] = React.useState('');
  const [orderBeforeReset, setOrderBeforeReset] = React.useState<string[] | null>(null);
  const moveButtonsRef = React.useRef(new Map<string, HTMLButtonElement | null>());

  // `getAllLeafColumns` aplica el orden elegido por el usuario; `getAllFlatColumns` devuelve
  // siempre el orden en que las columnas están declaradas, o sea el orden original.
  const orderedColumns = table.getAllLeafColumns();
  const movableColumns = getMovableColumns(orderedColumns);
  const currentOrder = orderedColumns.map((column) => column.id);
  const defaultOrder = table.getAllFlatColumns().map((column) => column.id);

  const isDefaultOrder = currentOrder.join(',') === defaultOrder.join(',');
  const visibleCount = movableColumns.filter((column) => column.getIsVisible()).length;
  const allVisible = visibleCount === movableColumns.length;
  const isSearching = search.trim().length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  };

  /**
   * Reconstruye el orden COMPLETO a partir del nuevo orden de las columnas movibles.
   *
   * El panel lista solo las movibles, pero `columnOrder` de TanStack es la lista de todas.
   * Cada columna no movible queda clavada en la posición que ya ocupaba y los huecos
   * restantes se completan, en orden, con las movibles. Así `select` sigue primera y
   * `actions` última sin necesidad de nombrarlas.
   */
  const applyMovableOrder = (nextMovableIds: string[]) => {
    const movableIds = new Set(movableColumns.map((column) => column.id));
    let cursor = 0;

    table.setColumnOrder(currentOrder.map((id) => (movableIds.has(id) ? nextMovableIds[cursor++] : id)));
  };

  /**
   * Al reordenar, el botón que el usuario apretó puede quedar deshabilitado (llegó al
   * extremo). Sin esto el foco se va al body y quien navega por teclado pierde el hilo:
   * se lo devolvemos al mismo control, o al opuesto si ese quedó deshabilitado.
   */
  const restoreFocusAfterMove = (columnId: string, direction: -1 | 1, targetIndex: number) => {
    const reachedEdge = direction === -1 ? targetIndex === 0 : targetIndex === movableColumns.length - 1;
    const focusDirection = reachedEdge ? (direction === -1 ? 1 : -1) : direction;

    requestAnimationFrame(() => {
      moveButtonsRef.current.get(getMoveButtonKey(columnId, focusDirection))?.focus();
    });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= movableColumns.length) return;

    const column = movableColumns[index];
    const nextMovableIds = movableColumns.map((movable) => movable.id);
    [nextMovableIds[index], nextMovableIds[targetIndex]] = [nextMovableIds[targetIndex], nextMovableIds[index]];

    applyMovableOrder(nextMovableIds);
    // El orden guardado antes de restablecer ya no representa nada una vez que se vuelve a mover.
    setOrderBeforeReset(null);
    setAnnouncement(`${getColumnTitle(column)} se movió a la posición ${targetIndex + 1} de ${movableColumns.length}.`);
    restoreFocusAfterMove(column.id, direction, targetIndex);
  };

  const resetOrder = () => {
    setOrderBeforeReset(currentOrder);
    table.setColumnOrder(defaultOrder);
    setAnnouncement('Se restableció el orden original de las columnas.');
  };

  const undoReset = () => {
    if (!orderBeforeReset) return;

    table.setColumnOrder(orderBeforeReset);
    setOrderBeforeReset(null);
    setAnnouncement('Se volvió al orden anterior.');
  };

  const showAllColumns = () => {
    table.toggleAllColumnsVisible(true);
    setAnnouncement('Se muestran todas las columnas.');
  };

  const toggleColumn = (column: Column<TData, unknown>) => {
    const nextVisible = !column.getIsVisible();
    column.toggleVisibility(nextVisible);
    setAnnouncement(`${getColumnTitle(column)}: ${nextVisible ? 'visible' : 'oculta'}.`);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-9 lg:flex"
          data-testid="column-toggle"
          aria-label="Elegir columnas a mostrar"
        >
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Columnas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        {movableColumns.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Esta tabla no tiene columnas configurables.</p>
        ) : (
          <Command filter={matchSearchByTitle} className="h-auto">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar columna…"
              aria-label="Buscar columna"
              data-testid="column-toggle-search"
            />
            {enableColumnReorder && (
              <p className="text-muted-foreground px-3 pt-2 text-xs">
                {isSearching
                  ? 'Borrá la búsqueda para mover columnas.'
                  : 'La primera de la lista es la que aparece más a la izquierda en la tabla.'}
              </p>
            )}
            <CommandList className="max-h-72 overscroll-contain">
              <CommandEmpty>No hay columnas con ese nombre</CommandEmpty>
              <CommandGroup>
                {movableColumns.map((column, index) => {
                  const title = getColumnTitle(column);
                  const isVisible = column.getIsVisible();

                  return (
                    <CommandItem
                      key={column.id}
                      value={column.id}
                      keywords={[title]}
                      onSelect={() => toggleColumn(column)}
                      data-testid={`toggle-column-${column.id}`}
                      data-checked={isVisible}
                      className="gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          isVisible
                            ? 'border-primary bg-primary text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[4px] border'
                            : 'border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border'
                        }
                      >
                        <Check className={isVisible ? 'size-3 text-current' : 'size-3 opacity-0'} />
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={title}>
                        {title}
                      </span>
                      <span className="sr-only">{isVisible ? 'Visible' : 'Oculta'}</span>
                      {enableColumnReorder && !isSearching && (
                        // Los botones no deben disparar el onSelect de la fila ni el Enter global de Command
                        <span
                          className="flex shrink-0 items-center"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            ref={(node) => {
                              moveButtonsRef.current.set(getMoveButtonKey(column.id, -1), node);
                            }}
                            disabled={index === 0}
                            aria-label={`Mover ${title} hacia arriba`}
                            data-testid={`move-column-up-${column.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              moveColumn(index, -1);
                            }}
                          >
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            ref={(node) => {
                              moveButtonsRef.current.set(getMoveButtonKey(column.id, 1), node);
                            }}
                            disabled={index === movableColumns.length - 1}
                            aria-label={`Mover ${title} hacia abajo`}
                            data-testid={`move-column-down-${column.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              moveColumn(index, 1);
                            }}
                          >
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          </Button>
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {movableColumns.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="text-muted-foreground text-xs tabular-nums">
                {visibleCount} de {movableColumns.length} {movableColumns.length === 1 ? 'visible' : 'visibles'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={allVisible}
                onClick={showAllColumns}
                data-testid="column-toggle-show-all"
              >
                Mostrar todas
              </Button>
            </div>
          </>
        )}

        {enableColumnReorder && movableColumns.length > 0 && (
          <>
            <Separator />
            <div className="p-1">
              {orderBeforeReset ? (
                <div className="flex items-center justify-between gap-2 py-1 pl-2 pr-1">
                  <p className="text-muted-foreground min-w-0 truncate text-xs">Se restableció el orden original.</p>
                  <Button type="button" variant="ghost" size="xs" onClick={undoReset}>
                    <Undo2 aria-hidden="true" />
                    Deshacer
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start font-normal"
                  disabled={isDefaultOrder}
                  onClick={resetOrder}
                >
                  <RotateCcw aria-hidden="true" />
                  Restablecer orden original
                </Button>
              )}
            </div>
          </>
        )}

        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </PopoverContent>
    </Popover>
  );
}
