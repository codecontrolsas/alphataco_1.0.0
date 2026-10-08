'use client';

import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { DataTableSelectionBarProps } from './types';

/**
 * Barra de selección (§3.5.4). Desktop: reemplaza a la toolbar (`placement="toolbar"`, solo si el consumidor pasó
 * `selectionActions`). Mobile: queda pegada abajo (`placement="sticky-bottom"`, sticky y no fixed, para que
 * funcione dentro de un dialog y con varias tablas en la página).
 * La selección sigue siendo la del `rowSelection` de la tabla: "Limpiar" equivale a destildar a mano.
 */
export function DataTableSelectionBar<TData>({ table, selectionActions, placement }: DataTableSelectionBarProps<TData>) {
  // Incluye filas de otras páginas: el estado guarda ids, no filas.
  const selectedCount = Object.keys(table.getState().rowSelection).length;

  // Si la toolbar desapareció con el foco adentro, el foco pasa a "Limpiar selección" (sin useEffect).
  const focusIfLost = useCallback((node: HTMLButtonElement | null) => {
    if (node && document.activeElement === document.body) node.focus();
  }, []);

  if (selectedCount === 0) return null;

  const clearSelection = () => table.setRowSelection({});

  const selectedRows = table.getSelectedRowModel().rows;
  const isSticky = placement === 'sticky-bottom';

  return (
    <div
      data-testid={isSticky ? 'table-selection-bar-mobile' : 'table-selection-bar'}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2',
        isSticky
          ? 'bg-card border-border sticky bottom-0 z-30 border-t px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
          : 'bg-primary-soft border-border min-h-12 border-b px-3'
      )}
    >
      <span className="text-label tabular-nums">
        <strong className="font-semibold">{selectedCount}</strong>{' '}
        {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}
      </span>
      {!isSticky ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => table.toggleAllPageRowsSelected(true)}>
          Seleccionar página
        </Button>
      ) : null}
      {selectionActions ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{selectionActions(selectedRows, clearSelection)}</div>
      ) : (
        <span className="flex-1" />
      )}
      <Button ref={focusIfLost} type="button" variant="ghost" size="sm" onClick={clearSelection}>
        Limpiar selección
      </Button>
    </div>
  );
}
