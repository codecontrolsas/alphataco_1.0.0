'use client';

import type { Table } from '@tanstack/react-table';
import { Columns3, Download, Loader2, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';

import { DataTableFilterVisibilityList, type DataTableFilterOptionsProps } from './DataTableFilterOptions';
import { DataTableColumnsPanel } from './DataTableViewOptions';

export interface DataTableMoreMenuProps<TData> {
  table: Table<TData>;
  /** Con reordenamiento, el diálogo de columnas suma las flechas de `ColumnOrderOptions`. */
  enableColumnReorder?: boolean;
  /** Sin esta lista no aparece "Filas por página". */
  pageSizeOptions?: number[];
  /** Sin `onExport` no aparece "Exportar a Excel" (la tabla no tiene `exportConfig`). */
  onExport?: () => void;
  isExporting?: boolean;
  /** Sin esto no aparece "Mostrar filtros…". */
  filterOptions?: DataTableFilterOptionsProps;
  /** Sin `showColumnToggle` la tabla no ofrece "Columnas…". */
  showColumnToggle?: boolean;
}

type OpenDialog = 'columns' | 'filters' | null;

/**
 * ⋯ de la toolbar mobile: reúne lo que en desktop son botones sueltos (columnas, exportar, filas por
 * página y visibilidad de filtros). Lo que la tabla no tiene, no aparece.
 */
export function DataTableMoreMenu<TData>({
  table,
  enableColumnReorder = false,
  pageSizeOptions,
  onExport,
  isExporting = false,
  filterOptions,
  showColumnToggle = true,
}: DataTableMoreMenuProps<TData>) {
  const [openDialog, setOpenDialog] = React.useState<OpenDialog>(null);
  // Los diálogos se montan recién al abrirlos por primera vez: cada `ResponsiveDialog` escucha un media query y una
  // página puede tener ~25 tablas (Mantenimiento). Una vez montados quedan, para conservar la animación de cierre.
  const [mountedDialogs, setMountedDialogs] = React.useState<{ columns: boolean; filters: boolean }>({
    columns: false,
    filters: false,
  });
  const openPanel = (dialog: 'columns' | 'filters') => {
    setMountedDialogs((current) => (current[dialog] ? current : { ...current, [dialog]: true }));
    setOpenDialog(dialog);
  };
  const pageSize = table.getState().pagination.pageSize;
  const hasPageSizes = !!pageSizeOptions && pageSizeOptions.length > 0;

  if (!showColumnToggle && !onExport && !hasPageSizes && !filterOptions) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Más opciones de la tabla"
            data-testid="table-more-menu"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showColumnToggle && (
            <DropdownMenuItem onSelect={() => openPanel('columns')}>
              <Columns3 aria-hidden="true" />
              Columnas…
            </DropdownMenuItem>
          )}
          {filterOptions && (
            <DropdownMenuItem onSelect={() => openPanel('filters')}>
              <SlidersHorizontal aria-hidden="true" />
              Mostrar filtros…
            </DropdownMenuItem>
          )}
          {onExport && (
            <DropdownMenuItem disabled={isExporting} onSelect={onExport}>
              {isExporting ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {isExporting ? 'Exportando…' : 'Exportar a Excel'}
            </DropdownMenuItem>
          )}
          {hasPageSizes && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Filas por página</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={`${pageSize}`} onValueChange={(value) => table.setPageSize(Number(value))}>
                    {pageSizeOptions.map((size) => (
                      <DropdownMenuRadioItem key={size} value={`${size}`}>
                        <span className="tabular-nums">{size}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {mountedDialogs.columns && (
        <ResponsiveDialog
          open={openDialog === 'columns'}
          onOpenChange={(open) => setOpenDialog(open ? 'columns' : null)}
          title="Columnas"
          size="sm"
        >
          <DataTableColumnsPanel table={table} enableColumnReorder={enableColumnReorder} />
        </ResponsiveDialog>
      )}

      {filterOptions && mountedDialogs.filters && (
        <ResponsiveDialog
          open={openDialog === 'filters'}
          onOpenChange={(open) => setOpenDialog(open ? 'filters' : null)}
          title="Mostrar filtros"
          size="sm"
        >
          <DataTableFilterVisibilityList {...filterOptions} />
        </ResponsiveDialog>
      )}
    </>
  );
}
