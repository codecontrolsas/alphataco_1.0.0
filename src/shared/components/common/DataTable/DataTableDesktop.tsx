'use client';

import { flexRender } from '@tanstack/react-table';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  DataTableEmptyRow,
  DataTableErrorCallout,
  DataTableRefetchBar,
  DataTableSkeletonRows,
} from './DataTableStates';
import type { DataTableDesktopProps } from './types';

const ACTIONS_COLUMN_ID = 'actions';

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * Vista desktop del DataTable: header sticky de 32px, filas de 36px, columna `actions` sticky a la derecha
 * y los estados (skeleton de carga inicial, vacío, filtrado, error con "Reintentar", barra de refetch).
 *
 * Recibe la instancia de `table` ya armada: no hace fetching ni toca la URL. El borde, la toolbar y el pie
 * los pone el contenedor (`DataTable`). Las clases de fila viven acá y no en `ui/table.tsx`, que usan otros
 * archivos del sistema.
 */
export function DataTableDesktop<TData>({
  table,
  hideWhenNarrow = false,
  rowClassName,
  isInitialLoading = false,
  isRefetching = false,
  isError = false,
  onRetry,
  hasActiveFilters,
  onClearFilters,
  emptyMessage,
  emptyDescription,
}: DataTableDesktopProps<TData>) {
  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const hasRows = rows.length > 0;
  // Con error y sin filas no se dibuja el vacío: afirmaría "no hay datos" cuando en realidad falló la carga.
  const showEmpty = !isInitialLoading && !hasRows && !isError;

  return (
    <div data-slot="data-table-desktop" className={cn('relative', hideWhenNarrow && 'hidden @3xl/table:block')}>
      {isError && !isInitialLoading ? <DataTableErrorCallout onRetry={onRetry} /> : null}

      {/* La barra de refetch queda justo debajo del header sticky (h-8). */}
      {isRefetching ? <DataTableRefetchBar className="absolute inset-x-0 top-8 z-20" /> : null}

      <div className="scroll-fade-start max-h-[60dvh] scroll-pt-8 overflow-auto">
        <Table
          containerClassName="overflow-x-visible overflow-y-visible min-w-fit"
          aria-busy={isInitialLoading || isRefetching || undefined}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b-0 hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const isActions = header.column.id === ACTIONS_COLUMN_ID;
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                      className={cn(
                        'sticky top-0 z-10 h-8 border-b border-border-strong bg-muted px-3 text-overline whitespace-nowrap text-muted-foreground',
                        isActions && 'right-0 z-20 shadow-[inset_1px_0_0_var(--border)]'
                      )}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn(isRefetching && 'pointer-events-none opacity-60')}>
            {isInitialLoading ? (
              <DataTableSkeletonRows columnCount={visibleColumnCount} />
            ) : hasRows ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  data-testid={`table-row-${row.id}`}
                  className={cn(
                    'group/row h-9 border-b border-border text-cell transition-none hover:bg-accent/60 data-[state=selected]:bg-primary-soft',
                    rowClassName?.(row.original)
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === ACTIONS_COLUMN_ID;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 py-0 align-middle group-data-[state=selected]/row:first:shadow-[inset_2px_0_0_var(--primary)]',
                          isActions &&
                            'sticky right-0 z-1 bg-card shadow-[inset_1px_0_0_var(--border)] group-hover/row:bg-accent group-data-[state=selected]/row:bg-primary-soft'
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : showEmpty ? (
              <DataTableEmptyRow
                colSpan={Math.max(visibleColumnCount, 1)}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={onClearFilters}
                emptyMessage={emptyMessage}
                emptyDescription={emptyDescription}
              />
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
