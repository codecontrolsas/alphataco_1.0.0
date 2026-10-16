'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Cookies from 'js-cookie';
import * as React from 'react';
import { DataTableToolbarBase } from '../toolbars/data-table-toolbar-base';
import { DataTablePagination } from './data-table-pagination';

// Tipos para el toolbar
interface FilterableColumn<TData> {
  columnId: string;
  title: string;
  options?: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  // Soporte para filtros de rango de fechas
  type?: 'date-range';
  showFrom?: boolean;
  showTo?: boolean;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  // Valores predeterminados para el filtro de fechas
  defaultValues?: {
    from: Date | null;
    to: Date | null;
  };
}

interface SearchableColumn {
  columnId: string;
  placeholder?: string;
}

import { cn } from '@/lib/utils';
import type { Row, Table as TableType, Updater } from '@tanstack/react-table';
import { forwardRef, useCallback } from 'react';

export interface BulkActionProps<TData> {
  enabled?: boolean; // Activar/desactivar funcionalidad
  label?: string; // Etiqueta del botón
  icon?: React.ReactNode; // Icono opcional
  onClick: (rows: TData[]) => void; // Función a ejecutar con las filas seleccionadas
}

interface ToolbarOptions<TData> {
  filterableColumns?: FilterableColumn<TData>[];
  searchableColumns?: SearchableColumn[];
  showViewOptions?: boolean;
  showFilterOptions?: boolean; // Nueva opción para mostrar el selector de filtros
  initialVisibleFilters: string[]; // Filtros inicialmente visibles
  extraActions?: React.ReactNode | ((table: TableType<TData>) => React.ReactNode);
  bulkAction?: BulkActionProps<TData>;
  showExport?: boolean;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean) | undefined;
  data: TData[];
  onRowClick?: (row: TData) => void;
  toolbarOptions?: ToolbarOptions<TData>;
  paginationComponent?: React.ReactNode | ((props: { table: TableType<TData> }) => React.ReactNode);
  className?: string;
  tableId?: string; // ID para persistencia
  initialColumnVisibility?: VisibilityState; // Estado inicial de columnas
  savedVisibility: VisibilityState;
  row_classname?: (row: TData) => string | string;
  bulkAction?: BulkActionProps<TData>;
  onColumnFiltersChange?: (filters: Updater<ColumnFiltersState>) => void;
  onRowSelectionChange?: (rows: TData[]) => void;
  tableRef?: React.RefObject<TableType<TData>>;
}

export const BaseDataTable = forwardRef<TableType<any>, DataTableProps<any, any>>(function BaseDataTable<TData, TValue>(
  {
    columns,
    data,
    onRowClick,
    toolbarOptions,
    paginationComponent,
    className = '',
    tableId,
    savedVisibility,
    row_classname,
    onColumnFiltersChange,
    enableRowSelection = true,
    onRowSelectionChange,
    tableRef,
  }: DataTableProps<TData, TValue>,
  ref: React.Ref<TableType<TData>>
) {
  // Agregar método para limpiar selección de filas específicas
  const clearRowSelection = useCallback(
    (rowIdsToClear?: string[]) => {
      if (!rowIdsToClear || rowIdsToClear.length === 0) {
        // Limpiar toda la selección
        setRowSelection({});
        return;
      }

      // Limpiar solo las filas específicas
      setRowSelection((prev) => {
        const newSelection = { ...prev } as Record<string, boolean>;

        // Buscar filas por ID y deseleccionarlas
        data.forEach((row, index) => {
          const rowData = row as { id?: string } | null;
          if (rowData && rowData.id && rowIdsToClear.includes(rowData.id)) {
            delete newSelection[index.toString()];
          }
        });

        return newSelection;
      });
    },
    [data]
  );
  // Intentar cargar la visibilidad guardada antes del renderizado inicial si hay tableId
  // const savedVisibility = savedColumns
  const cookiesStore = Cookies.get('pageSize-table');
  const cookiesStoreIndex = Cookies.get('pageIndex-table');

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pageSize, setPageSize] = React.useState<number>(cookiesStore ? Number(cookiesStore) : 10);
  const [pageIndex, setPageIndex] = React.useState<number>(0);

  // Usar la visibilidad guardada, o la inicial si se proporciona, o un objeto vacío
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(savedVisibility || {});

  // Efecto para limpiar la selección cuando los datos cambian significativamente
  React.useEffect(() => {
    // Si hay cambios significativos en los datos (como después de un refetch),
    // limpiar las filas que ya no existen en la nueva data
    setRowSelection((prev) => {
      const newSelection = { ...prev } as Record<string, boolean>;
      let hasChanges = false;

      // Verificar cada fila seleccionada
      Object.keys(newSelection).forEach((key) => {
        const index = parseInt(key);
        // Si el índice ya no existe en la nueva data, limpiar la selección
        if (!data[index]) {
          delete newSelection[key];
          hasChanges = true;
        }
      });

      return hasChanges ? newSelection : prev;
    });
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination: {
        pageSize,
        pageIndex,
      },
    },
    onPaginationChange: (updater) => {
      // Para evitar problemas con la actualización de estado de paginación
      if (typeof updater === 'function') {
        const currentPagination = { pageIndex, pageSize };
        const newPagination = updater(currentPagination);
        if (newPagination.pageSize !== pageSize) {
          setPageSize(newPagination.pageSize);
          Cookies.set('pageSize-table', newPagination.pageSize.toString());
        }
        if (newPagination.pageIndex !== pageIndex) {
          setPageIndex(newPagination.pageIndex);
          Cookies.set('pageIndex-table', newPagination.pageIndex.toString());
        }
      } else {
        // Si es un objeto directo de paginación
        if (updater.pageSize !== pageSize) {
          setPageSize(updater.pageSize);
        }
        if (updater.pageIndex !== pageIndex) {
          setPageIndex(updater.pageIndex);
        }
      }
    },
    onRowSelectionChange: (rows) => {
      const newSelection = typeof rows === 'function' ? rows(rowSelection) : rows;
      setRowSelection(newSelection);
      if (onRowSelectionChange) {
        const selectedRows = Object.keys(newSelection)
          .filter((key) => newSelection[key])
          .map((key) => data[parseInt(key)]);
        onRowSelectionChange(selectedRows);
      }
    },
    onSortingChange: setSorting,
    // En BaseDataTable.tsx, modificar la llamada al callback:
    onColumnFiltersChange: (updater) => {
      const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater;
      setColumnFilters(newFilters);

      // Llamar al callback si existe, pasando el valor final, no el updater
      if (onColumnFiltersChange) {
        onColumnFiltersChange(newFilters);
      }
    },
    onColumnVisibilityChange: (visibility) => {
      setColumnVisibility(visibility);
    },
    enableRowSelection: enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  // Exponer el objeto table y el método clearRowSelection a través de la ref
  React.useImperativeHandle(
    ref,
    () => ({
      ...table,
      clearRowSelection,
    }),
    [table, clearRowSelection]
  );

  return (
    <div>
      <div className="relative">
        <div className={`space-y-4 ${className} w-full grid grid-cols-1`}>
          {toolbarOptions && (
            <DataTableToolbarBase
              table={table}
              showExport={toolbarOptions.showExport}
              filterableColumns={toolbarOptions.filterableColumns}
              searchableColumns={toolbarOptions.searchableColumns}
              initialVisibleFilters={toolbarOptions.initialVisibleFilters}
              showViewOptions={toolbarOptions.showViewOptions}
              bulkAction={toolbarOptions.bulkAction}
              extraActions={
                typeof toolbarOptions.extraActions === 'function'
                  ? toolbarOptions.extraActions(table)
                  : toolbarOptions.extraActions
              }
              tableId={tableId}
            />
          )}
          <div className="rounded-xl border overflow-auto max-h-[60vh] relative">
            <Table containerClassName="overflow-x-visible overflow-y-visible min-w-fit">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          className="sticky top-0 z-10 bg-background dark:bg-slate-950"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, { ...header.getContext(), table })}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table?.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      className={
                        typeof row_classname === 'string'
                          ? cn(row_classname, onRowClick && 'hover:cursor-pointer')
                          : row_classname
                            ? row_classname(row.original)
                            : onRowClick
                              ? 'hover:cursor-pointer'
                              : ''
                      }
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      onClick={() => onRowClick && onRowClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {paginationComponent ? (
            typeof paginationComponent === 'function' ? (
              (paginationComponent as (props: { table: TableType<TData> }) => React.ReactNode)({ table })
            ) : React.isValidElement(paginationComponent) ? (
              React.cloneElement(paginationComponent as React.ReactElement<{ table: TableType<TData> }>, { table })
            ) : (
              paginationComponent
            )
          ) : (
            <DataTablePagination table={table} />
          )}
        </div>
      </div>
    </div>
  );
});
