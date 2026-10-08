'use client';

import type { Column, Table } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Columns3, RotateCcw, Undo2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

import { getColumnLabel } from './mobile-columns';
import type { DataTableViewOptionsProps } from './types';

/** Título legible de la columna (el mismo que usan el toggle de columnas, el export a Excel y las tarjetas) */
const getColumnTitle = getColumnLabel;

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
 * Dropdown para toggle de visibilidad de columnas
 *
 * Con `enableColumnReorder` la superficie cambia a un panel que además permite mover
 * cada columna. Sin el flag, el menú es exactamente el de siempre.
 *
 * @example
 * ```tsx
 * <DataTableViewOptions table={table} />
 * <DataTableViewOptions table={table} enableColumnReorder />
 * ```
 */
export function DataTableViewOptions<TData>({ table, enableColumnReorder = false }: DataTableViewOptionsProps<TData>) {
  if (enableColumnReorder) {
    return <ColumnOrderOptions table={table} />;
  }

  return <ColumnVisibilityOptions table={table} />;
}

/** Menú clásico: solo mostrar/ocultar columnas */
function ColumnVisibilityOptions<TData>({ table }: { table: Table<TData> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" data-testid="column-toggle">
          <Columns3 aria-hidden="true" />
          Columnas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {getMovableColumns(table.getAllColumns()).map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
            data-testid={`toggle-column-${column.id}`}
          >
            {getColumnTitle(column)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Panel para mostrar/ocultar Y mover columnas.
 *
 * Es un `Popover` y no un `DropdownMenu` a propósito: los items de un menú de Radix son
 * `menuitemcheckbox` con foco itinerante y typeahead propios, y el patrón ARIA de menú no
 * admite botones enfocables anidados. Metiendo las flechas ahí adentro, el teclado queda
 * roto. En un popover la lista es una `ul` común y los botones se comportan como botones.
 */
function ColumnOrderOptions<TData>({ table }: { table: Table<TData> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm" data-testid="column-toggle">
          <Columns3 aria-hidden="true" />
          Columnas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <ColumnOrderPanel table={table} />
      </PopoverContent>
    </Popover>
  );
}

/** Cuerpo del panel de columnas (mostrar/ocultar y mover). Lo usan el popover de desktop y el diálogo del ⋯ mobile. */
function ColumnOrderPanel<TData>({ table }: { table: Table<TData> }) {
  const fieldId = React.useId();
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
  const hasVisibleColumns = movableColumns.some((column) => column.getIsVisible());

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
   * Al reordenar, la fila cambia de lugar y el botón que el usuario apretó puede quedar
   * deshabilitado (llegó al extremo). Sin esto el navegador manda el foco al body y quien
   * navega por teclado pierde el hilo: se lo devolvemos al mismo control, o al opuesto si
   * ese quedó deshabilitado.
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

  return (
    <>
        <div className="px-3 pb-2 pt-3">
          <p className="text-sm font-medium">Columnas</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Elegí cuáles ver y movelas para cambiar el orden. La primera de la lista es la que aparece más a la
            izquierda en la tabla.
          </p>
        </div>

        <Separator />

        {movableColumns.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-sm">Esta tabla no tiene columnas configurables.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto overscroll-contain px-2 py-2">
            {movableColumns.map((column, index) => {
              const title = getColumnTitle(column);
              const checkboxId = `${fieldId}-${column.id}`;
              const isFirst = index === 0;
              const isLast = index === movableColumns.length - 1;

              return (
                <li
                  key={column.id}
                  className="hover:bg-accent/60 focus-within:bg-accent flex items-center gap-2 rounded-md py-0.5 pl-2 pr-1"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    data-testid={`toggle-column-${column.id}`}
                  />
                  <label
                    htmlFor={checkboxId}
                    className="min-w-0 flex-1 cursor-pointer truncate py-1.5 text-sm"
                    title={title}
                  >
                    {title}
                  </label>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      ref={(node) => {
                        moveButtonsRef.current.set(getMoveButtonKey(column.id, -1), node);
                      }}
                      disabled={isFirst}
                      aria-label={`Mover ${title} hacia arriba`}
                      data-testid={`move-column-up-${column.id}`}
                      onClick={() => moveColumn(index, -1)}
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
                      disabled={isLast}
                      aria-label={`Mover ${title} hacia abajo`}
                      data-testid={`move-column-down-${column.id}`}
                      onClick={() => moveColumn(index, 1)}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {movableColumns.length > 0 && !hasVisibleColumns && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="text-muted-foreground text-xs">No hay ninguna columna visible.</p>
              <Button type="button" variant="outline" size="xs" onClick={showAllColumns}>
                Mostrar todas
              </Button>
            </div>
          </>
        )}

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

        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
    </>
  );
}

/** Lista simple de visibilidad (sin reordenar) para el diálogo de columnas del ⋯ mobile. */
function ColumnVisibilityPanel<TData>({ table }: { table: Table<TData> }) {
  const fieldId = React.useId();
  const columns = getMovableColumns(table.getAllColumns());

  if (columns.length === 0) {
    return <p className="text-muted-foreground px-3 py-4 text-sm">Esta tabla no tiene columnas configurables.</p>;
  }

  return (
    <ul className="px-2 py-2">
      {columns.map((column) => {
        const checkboxId = `${fieldId}-${column.id}`;
        return (
          <li key={column.id} className="flex items-center gap-2 py-0.5 pl-2 pr-1">
            <Checkbox
              id={checkboxId}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              data-testid={`toggle-column-${column.id}`}
            />
            <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate py-2.5 text-sm">
              {getColumnTitle(column)}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Panel de columnas sin disparador, para mostrarlo dentro de otra superficie (diálogo del ⋯ mobile).
 * Mismo contenido que el menú de desktop: con `enableColumnReorder` suma las flechas de orden.
 */
export function DataTableColumnsPanel<TData>({ table, enableColumnReorder = false }: DataTableViewOptionsProps<TData>) {
  return enableColumnReorder ? <ColumnOrderPanel table={table} /> : <ColumnVisibilityPanel table={table} />;
}
