'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import type { DataTablePaginationProps } from './types';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

/** Cantidad de números de página visibles en la ventana central. */
const PAGE_WINDOW = 5;

type PageItem = { type: 'page'; page: number } | { type: 'ellipsis'; key: string };

/** Arma `1 … 4 5 6 7 8 … 20`: la primera, la última y una ventana de 5 alrededor de la actual. */
function buildPageItems(current: number, count: number): PageItem[] {
  if (count <= PAGE_WINDOW + 2) {
    return Array.from({ length: count }, (_, i) => ({ type: 'page', page: i + 1 }));
  }

  const half = Math.floor(PAGE_WINDOW / 2);
  const start = Math.max(2, Math.min(current - half, count - PAGE_WINDOW));
  const end = Math.min(count - 1, start + PAGE_WINDOW - 1);

  const items: PageItem[] = [{ type: 'page', page: 1 }];
  if (start > 2) items.push({ type: 'ellipsis', key: 'start' });
  for (let page = start; page <= end; page++) items.push({ type: 'page', page });
  if (end < count - 1) items.push({ type: 'ellipsis', key: 'end' });
  items.push({ type: 'page', page: count });
  return items;
}

/**
 * Pie del DataTable: "1–50 de 387" a la izquierda y, a la derecha, select de filas, `‹` números `›`.
 *
 * Es un solo DOM que se reacomoda por container query (`@container/table` lo pone el DataTable):
 * - desde `@3xl/table`: pie completo (select, números de página, `«`/`»` desde `@5xl/table`).
 * - por debajo: paginación compacta centrada "‹ 1–50 de 387 ›" con botones de 44×44, sin números ni select.
 *
 * @example
 * ```tsx
 * <DataTablePagination table={table} totalRows={100} pageSizeOptions={[10, 20, 50]} />
 * ```
 */
export function DataTablePagination<TData>({
  table,
  totalRows,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  showRowSelection = false,
}: DataTablePaginationProps<TData>) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const pageCount = table.getPageCount();
  const currentPage = pageIndex + 1;

  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);
  const selectedCount = showRowSelection ? table.getFilteredSelectedRowModel().rows.length : 0;

  const pageItems = buildPageItems(currentPage, pageCount);

  // En mobile los botones miden 44×44; desde el contenedor ancho vuelven a 28px.
  const navButtonClass = 'size-11 p-0 @3xl/table:size-7';

  return (
    <div
      data-slot="data-table-pagination"
      className="flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-border bg-panel-2 px-3 py-1 text-caption tabular-nums @3xl/table:justify-between"
    >
      {/* Rango + selección */}
      {/* Sin aria-live: el total y la selección los anuncia la live region de la raíz (siempre montada). */}
      <div
        className="order-2 min-w-0 text-center text-muted-foreground @3xl/table:order-none @3xl/table:text-left"
      >
        {totalRows === 0 ? (
          <span>0 resultados</span>
        ) : (
          <span>
            <span className="font-medium text-foreground">
              {startRow}–{endRow}
            </span>{' '}
            de <span className="font-medium text-foreground">{totalRows}</span>
          </span>
        )}
        {selectedCount > 0 && (
          <span>
            {' '}
            · {selectedCount} {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
        )}
      </div>

      {/* Controles: en mobile sus hijos se reparten en la fila (prev · rango · next) */}
      <div className="contents @3xl/table:flex @3xl/table:items-center @3xl/table:gap-2">
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => {
            table.setPageSize(Number(value));
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Filas por página"
            className="hidden w-auto min-w-[92px] gap-1.5 tabular-nums @3xl/table:flex"
            data-testid="page-size-select"
          >
            <SelectValue placeholder={pageSize}>{pageSize} / pág.</SelectValue>
          </SelectTrigger>
          <SelectContent side="top">
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={`${size}`}>
                {size} / pág.
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          className={cn(navButtonClass, 'hidden @5xl/table:inline-flex')}
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label="Primera página"
          data-testid="pagination-first"
        >
          <ChevronsLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(navButtonClass, 'order-1 @3xl/table:order-none')}
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="Página anterior"
          data-testid="pagination-prev"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>

        {/* Números de página compactos (solo contenedor ancho) */}
        <nav aria-label="Páginas" className="hidden items-center gap-0.5 @3xl/table:flex">
          {pageItems.map((item) =>
            item.type === 'ellipsis' ? (
              <span key={item.key} aria-hidden="true" className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={item.page}
                type="button"
                variant={item.page === currentPage ? 'secondary' : 'ghost'}
                className="h-7 min-w-7 px-1.5 text-caption tabular-nums"
                onClick={() => table.setPageIndex(item.page - 1)}
                aria-current={item.page === currentPage ? 'page' : undefined}
                aria-label={`Página ${item.page}`}
                data-testid={`pagination-page-${item.page}`}
              >
                {item.page}
              </Button>
            )
          )}
        </nav>

        <Button
          type="button"
          variant="ghost"
          className={cn(navButtonClass, 'order-3 @3xl/table:order-none')}
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="Página siguiente"
          data-testid="pagination-next"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(navButtonClass, 'order-4 hidden @5xl/table:inline-flex')}
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
          aria-label="Última página"
          data-testid="pagination-last"
        >
          <ChevronsRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
