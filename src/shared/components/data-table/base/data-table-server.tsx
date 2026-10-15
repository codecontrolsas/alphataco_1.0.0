'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import * as React from 'react';
// import { DataTableToolbar, type BulkActionProps } from "./data-table-toolbar"
import { Skeleton } from '@/components/ui/skeleton';
import {
  clearTableFilters,
  getTableFilters,
  setTableFilters,
  type FilterValue,
  type TableFilterState,
} from '@/lib/cookies';
import { cn } from '@/lib/utils';
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Row, Table as TableType, Updater } from '@tanstack/react-table';
import { FacetedFilterConfig } from '../filters/data-table-faceted-filter-server';
import { BulkActionProps, DataTableToolbar } from '../toolbars/data-table-toolbar-base-server';
import { DataTablePagination } from './data-table-pagination-server';

// Componente para el estado vacío con opción de reset
interface EmptyStateWithResetProps {
  onReset: () => void;
}

function EmptyStateWithReset({ onReset }: EmptyStateWithResetProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6">
      <div className="text-muted-foreground">Sin resultados</div>
      <div className="flex flex-col items-center gap-2 text-sm">
        <p className="text-muted-foreground/70">
          ¿Crees que esto es un error?{' '}
          <button onClick={onReset} className="text-primary hover:underline inline-flex items-center gap-1">
            Haz clic aquí para restablecer la tabla
          </button>
        </p>
      </div>
    </div>
  );
}

// P2 Task 13b: el nombre de tabla era `keyof Database['public']['Tables']` (tipos generados de
// PostgREST). El destino real, `querySelectDistinct`, ya valida la tabla en runtime contra
// `DISTINCT_VALUE_TABLES`, y el toolbar y el filtro de este mismo sistema legacy siempre usaron
// `TableName extends string`: el generic tipado era el único consumidor de `database.types` vivo.
interface FilterableColumn<TableName extends string, Query extends string = '*'> {
  columnId: string;
  title: string;
  options?: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  type?: 'date-range';
  showFrom?: boolean;
  showTo?: boolean;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  defaultValues?: {
    from: Date | null;
    to: Date | null;
  };
  config?: FacetedFilterConfig<TableName, Query>;
}

interface SearchableColumn {
  columnId: string;
  placeholder?: string;
}

// interface ToolbarOptions<
//   TData,
//   TableName extends string
// > {
//   filterableColumns?: FilterableColumn<TableName>[]
//   searchableColumns?: SearchableColumn[]
//   showFilterOptions?: boolean
//   // … resto de opciones
// }

interface ToolbarOptions<TData, TableName extends string> {
  filterableColumns?: FilterableColumn<TableName>[];
  searchableColumns?: SearchableColumn[];
  showViewOptions?: boolean;
  showFilterOptions?: boolean;
  initialVisibleFilters?: string[];
  extraActions?: React.ReactNode | ((table: TableType<TData>) => React.ReactNode);
  bulkAction?: BulkActionProps<TData>;
  showExport?: boolean;
}

interface DataTableProps<
  TData,
  TValue,
  TableName extends string,
  Query extends string = '*',
> {
  columns: ColumnDef<TData, TValue>[];
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean) | undefined;
  data?: TData[]; // Hacer opcional para server-side
  onRowClick?: (row: TData) => void;
  toolbarOptions?: ToolbarOptions<TData, TableName>;
  initialData?: {
    rows: TData[];
    pageCount: number;
    rowCount: number;
  };
  paginationComponent?:
    | React.ReactNode
    | ((props: { table: TableType<TData>; isLoading: boolean; totalRows?: number }) => React.ReactNode);
  className?: string;
  tableId?: string;
  initialColumnVisibility?: VisibilityState;
  savedVisibility: VisibilityState;
  row_classname?: (row: TData) => string | string;
  bulkAction?: BulkActionProps<TData>;
  onColumnFiltersChange?: (filters: Updater<ColumnFiltersState>) => void;
  onRowSelectionChange?: (rows: TData[]) => void;
  // Nuevas props para server-side pagination
  serverSide?: boolean;
  fetchData?: (options: {
    pageIndex: number;
    pageSize: number;
    sorting: SortingState;
    columnFilters: ColumnFiltersState;
  }) => Promise<{
    rows: TData[];
    pageCount: number;
    rowCount: number;
  }>;
  fetchAllData?: (options: { sorting: SortingState; columnFilters: ColumnFiltersState }) => Promise<TData[]>;
  queryKey?: string;
  initialSorting?: SortingState; // Nueva prop para ordenamiento inicial
}
export function BaseDataTable<
  TData,
  TValue,
  TableName extends string = never,
  Query extends string = '*',
>({
  columns,
  data: clientData,
  onRowClick,
  toolbarOptions,
  paginationComponent,
  className = '',
  tableId = 'default',
  savedVisibility,
  row_classname,
  onColumnFiltersChange,
  enableRowSelection = true,
  onRowSelectionChange,
  serverSide = false,
  fetchData,
  fetchAllData,
  queryKey = 'table-data',
  initialData,
  initialSorting = [],
}: DataTableProps<TData, TValue, TableName, Query>) {
  // Cargar el estado guardado de las cookies
  const queryClient = React.useMemo(() => new QueryClient(), [tableId]);
  const savedState = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getTableFilters(tableId);
  }, [tableId]);

  const [rowSelection, setRowSelection] = React.useState({});
  const [sorting, setSorting] = React.useState<SortingState>(savedState?.sorting || initialSorting);
  const [pageSize, setPageSize] = React.useState<number>(savedState?.pagination?.pageSize || 10);
  const [pageIndex, setPageIndex] = React.useState<number>(savedState?.pagination?.pageIndex || 0);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    savedState?.columnVisibility || savedVisibility || {}
  );

  // Inicializar los filtros de columnas desde el estado guardado
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    savedState?.columnFilters?.map((f) => ({
      id: f.id,
      value: f.value,
    })) || []
  );

  // Guardar el estado cuando cambie
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const state: TableFilterState = {
      columnFilters: columnFilters.map((filter) => ({
        id: filter.id,
        value: filter.value as FilterValue,
        type: Array.isArray(filter.value)
          ? 'faceted'
          : typeof filter.value === 'object' &&
              filter.value !== null &&
              ('from' in filter.value || 'to' in filter.value)
            ? 'date-range'
            : 'search',
        title: filter.id,
      })),
      sorting,
      pagination: {
        pageIndex,
        pageSize,
      },
      columnVisibility,
    };

    setTableFilters(tableId, state);
  }, [columnFilters, sorting, pageIndex, pageSize, columnVisibility, tableId]);

  // Función para manejar cambios en los filtros
  const handleColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      setColumnFilters((old) => {
        const newFilters = typeof updater === 'function' ? updater(old) : updater;

        // Reset a la primera página cuando cambian los filtros
        if (JSON.stringify(newFilters) !== JSON.stringify(old)) {
          setPageIndex(0);
        }

        return newFilters;
      });

      if (onColumnFiltersChange) {
        onColumnFiltersChange(updater);
      }
    },
    [onColumnFiltersChange]
  );

  // Función para limpiar todos los filtros
  const clearAllFilters = React.useCallback(() => {
    setColumnFilters([]);
    setPageIndex(0);

    // También limpiar las cookies
    clearTableFilters(tableId);
  }, [tableId]);

  // Crear el estado de paginación para React Query
  const pagination = React.useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  // Query para server-side data
  const dataQuery = useQuery({
    queryKey: [queryKey, pageIndex, pageSize, sorting, columnFilters],
    queryFn: () => {
      return fetchData?.({
        pageIndex,
        pageSize,
        sorting,
        columnFilters,
      });
    },
    placeholderData: keepPreviousData,
    enabled: serverSide && !!fetchData,
    initialData:
      initialData && pageIndex === 0 && pageSize === 10 && columnFilters.length === 0 && sorting.length === 0
        ? initialData
        : undefined,
  });

  // Usar datos del servidor o datos del cliente
  const tableData = serverSide ? dataQuery.data?.rows ?? [] : clientData ?? [];
  const defaultData = React.useMemo(() => [], []);

  const table = useReactTable({
    data: tableData.length > 0 ? tableData : defaultData,
    columns,
    rowCount: serverSide ? dataQuery.data?.rowCount ?? 0 : undefined,

    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const currentPagination = { pageIndex, pageSize };
        const newPagination = updater(currentPagination);

        if (newPagination.pageSize !== pageSize) {
          setPageSize(newPagination.pageSize);
          // Reset a la primera página cuando cambia el tamaño de página
          setPageIndex(0);
        } else if (newPagination.pageIndex !== pageIndex) {
          setPageIndex(newPagination.pageIndex);
        }
      } else {
        if (updater.pageSize !== pageSize) {
          setPageSize(updater.pageSize);
          // Reset a la primera página cuando cambia el tamaño de página
          setPageIndex(0);
        } else if (updater.pageIndex !== pageIndex) {
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
          .map((key) => tableData[Number.parseInt(key)]);
        onRowSelectionChange(selectedRows);
      }
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnVisibilityChange: (visibility) => {
      setColumnVisibility(visibility);
    },
    enableRowSelection: enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: serverSide ? undefined : getFilteredRowModel(),
    getPaginationRowModel: serverSide ? undefined : getPaginationRowModel(),
    getSortedRowModel: serverSide ? undefined : getSortedRowModel(),
    getFacetedRowModel: serverSide ? undefined : getFacetedRowModel(),
    getFacetedUniqueValues: serverSide ? undefined : getFacetedUniqueValues(),
    manualPagination: serverSide,
    manualSorting: serverSide,
    manualFiltering: serverSide,
  });

  // Loading state para server-side
  const isLoading = dataQuery.isFetching;

  // Pasar las funciones necesarias al toolbar
  const toolbarProps = React.useMemo(
    () => ({
      ...toolbarOptions,
      onClearFilters: clearAllFilters,
    }),
    [toolbarOptions, clearAllFilters]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative">
        <div className={`space-y-4 ${className} w-full grid grid-cols-1`}>
          {toolbarOptions && (
            <DataTableToolbar
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
              isLoading={isLoading}
              serverSide={serverSide}
              fetchAllData={fetchAllData}
              {...toolbarProps}
            />
          )}
          <div className="rounded-md border overflow-auto max-h-[60vh] relative">
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
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24">
                      <div className="flex flex-col space-y-3">
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                        <Skeleton className="h-9 w-full " />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : table?.getRowModel().rows?.length ? (
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
                      <EmptyStateWithReset
                        onReset={() => {
                          // Limpiar filtros y sorting
                          setColumnFilters([]);
                          setSorting([]);
                          setPageIndex(0);

                          // Limpiar localStorage
                          clearTableFilters(tableId);

                          // Invalidar query para refetch
                          if (serverSide && queryKey) {
                            queryClient.invalidateQueries({ queryKey: [queryKey] });
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {paginationComponent ? (
            typeof paginationComponent === 'function' ? (
              (
                paginationComponent as (props: {
                  table: TableType<TData>;
                  isLoading: boolean;
                  totalRows?: number;
                }) => React.ReactNode
              )({
                table,
                isLoading,
                totalRows: serverSide ? dataQuery.data?.rowCount : undefined,
              })
            ) : React.isValidElement(paginationComponent) ? (
              React.cloneElement(
                paginationComponent as React.ReactElement<{
                  table: TableType<TData>;
                  isLoading: boolean;
                  totalRows: number | undefined;
                }>,
                {
                  table,
                  isLoading,
                  totalRows: serverSide ? dataQuery.data?.rowCount : undefined,
                }
              )
            ) : (
              paginationComponent
            )
          ) : (
            <DataTablePagination
              table={table}
              isLoading={isLoading}
              totalRows={serverSide ? dataQuery.data?.rowCount : undefined}
            />
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
