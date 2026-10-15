'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  saveTableColumnOrder,
  saveTableColumnVisibility,
  saveTableViewPreferences,
} from '@/shared/actions/table-preferences';

import { DataTableError } from './DataTableError';
import { DataTablePagination } from './DataTablePagination';
import { DataTablePendingProvider } from './DataTablePendingContext';
import { DataTableToolbar } from './DataTableToolbar';
import { _DataTableExportButton } from './_DataTableExportButton';
import { DEFAULT_PAGE_SIZE, reconcileColumnOrder, serializeSorting, stateToSearchParams } from './helpers';
import type { DataTableFacetedFilterConfig, DataTableProps, DataTableSearchParams } from './types';
import { useDataTable } from './useDataTable';

/**
 * Detecta qué columnIds tienen un filtro activo en los searchParams dados.
 * Maneja tanto filtros facetados/texto (key = columnId) como dateRange (key = columnId_from / columnId_to).
 * Los `facetedFilters` se usan para mapear los sufijos _from/_to al columnId base.
 */
function getActiveFilterColumnIds(
  searchParams: DataTableSearchParams,
  facetedFilters: DataTableFacetedFilterConfig[]
): Set<string> {
  const reservedKeys = new Set(['page', 'pageSize', 'sort', 'sortBy', 'sortOrder', 'search']);
  const active = new Set<string>();

  // Construir un índice de columnas dateRange para detectar los sufijos _from/_to
  const dateRangeColumnIds = new Set(facetedFilters.filter((f) => f.type === 'dateRange').map((f) => f.columnId));

  Object.entries(searchParams).forEach(([key, value]) => {
    if (reservedKeys.has(key) || !value) return;

    // Comprobar si es un sufijo _from o _to de un filtro dateRange
    if (key.endsWith('_from') || key.endsWith('_to')) {
      const suffix = key.endsWith('_from') ? '_from' : '_to';
      const baseKey = key.slice(0, key.length - suffix.length);
      if (dateRangeColumnIds.has(baseKey)) {
        active.add(baseKey);
        return;
      }
    }

    // Filtro normal (faceted o texto): la key ES el columnId
    if (!reservedKeys.has(key)) {
      active.add(key);
    }
  });

  return active;
}

/**
 * DataTable Server-Side con soporte para paginación, sorting y filtros.
 *
 * Soporta dos modos de operación:
 *
 * **Server mode** (default): El estado se sincroniza con la URL via router.push,
 * lo que dispara re-renders del servidor. Los datos llegan via props desde SSR.
 *
 * **Client-side mode** (cuando se pasa `queryFn`): Usa window.history.replaceState
 * para actualizar la URL silenciosamente (sin navegación) y React Query para
 * obtener datos. El resultado: filtros instantáneos sin re-renderizar otras tabs.
 *
 * **In-memory mode** (opt-in con `inMemory`): la tabla recibe el dataset completo
 * por `data` y resuelve ordenamiento, filtros, búsqueda y paginación en el cliente.
 * Para datos que no se pueden paginar server-side (ej: un RPC que devuelve un JSON
 * entero). La URL se actualiza igual que en client-side mode, sin navegación.
 */
/**
 * Estilos de `mobileCards`: debajo de `md` la tabla se convierte en una pila de tarjetas. Van
 * escritos completos (Tailwind v4 no genera clases armadas en runtime). Las dos primeras celdas
 * (selector e identidad) ocupan todo el ancho y sin rótulo; las demás llevan su `meta.title`. La tarjeta muestra
 * todas las columnas que estén visibles: el selector de columnas manda, no hay tope.
 */
const MOBILE_CARDS_WRAPPER = [
  'max-md:max-h-none max-md:overflow-visible max-md:border-0',
  'max-md:[&_table]:block max-md:[&_thead]:hidden max-md:[&_tbody]:block max-md:[&_tbody]:space-y-3',
  'max-md:[&_tr]:bg-card max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_tr]:gap-x-4 max-md:[&_tr]:gap-y-2 max-md:[&_tr]:rounded-xl max-md:[&_tr]:border max-md:[&_tr]:p-4',
  'max-md:[&_td]:block max-md:[&_td]:min-w-0 max-md:[&_td]:p-0 max-md:[&_td]:whitespace-normal',
  'max-md:[&_td:nth-child(-n+2)]:col-span-2',
  // Las etiquetas (pills) de una celda no pueden ser más anchas que la tarjeta: se parten en líneas.
  'max-md:[&_td_[data-slot=badge]]:max-w-full max-md:[&_td_[data-slot=badge]]:whitespace-normal max-md:[&_td_[data-slot=badge]]:text-left max-md:[&_td_div.inline-flex]:max-w-full',
  'max-md:[&_td:nth-child(n+3):not(:last-child)]:before:text-muted-foreground max-md:[&_td:nth-child(n+3):not(:last-child)]:before:block max-md:[&_td:nth-child(n+3):not(:last-child)]:before:text-xs max-md:[&_td:nth-child(n+3):not(:last-child)]:before:content-[attr(data-label)]',
  'max-md:[&_td:last-child]:col-span-2 max-md:[&_td:last-child]:justify-self-end',
].join(' ');

export function DataTable<TData extends Record<string, unknown>, TValue = unknown>({
  columns,
  data: propData,
  totalRows: propTotalRows,
  searchParams = {},
  facetedFilters = [],
  searchPlaceholder = 'Buscar...',
  searchColumn,
  showColumnToggle = true,
  showRowSelection = false,
  enableRowSelection = false,
  onRowSelectionChange,
  onRowSelectionIdsChange,
  clearSelectionTrigger,
  emptyMessage = 'No se encontraron resultados.',
  pageSizeOptions,
  toolbarActions,
  exportConfig,
  showExportButton = true,
  showSearch = false,
  mobileCards = false,
  initialColumnVisibility = {},
  initialPageSize,
  initialSorting,
  persistViewPreferences = false,
  enableColumnReorder = false,
  initialColumnOrder,
  tableId,
  paramNamespace,
  showFilterToggle = false,
  initialFilterVisibility = {},
  'data-testid': dataTestId = 'data-table',
  isFetchingFacets,
  rowClassName,
  // Client-side mode props
  queryFn,
  queryKey: queryKeyProp,
  queryStaleTimeMs = 30 * 1000,
  onStateChange,
  inMemory = false,
}: DataTableProps<TData, TValue>) {
  // Modo con fetch remoto (React Query). Manda sobre el modo in-memory.
  const isRemoteQuery = !!queryFn;
  // Modo in-memory: TanStack ordena, filtra y pagina el dataset completo en el cliente.
  const isInMemory = inMemory && !isRemoteQuery;
  // Ambos modos actualizan la URL con replaceState en vez de navegar con router.push.
  const isClientSide = isRemoteQuery || isInMemory;

  // Estado de selección de filas (local)
  const [rowSelection, setRowSelection] = React.useState({});

  // Estado de visibilidad de columnas (local, inicializado con las visibilidades por defecto)
  const [columnVisibility, setColumnVisibility] = React.useState(initialColumnVisibility);

  // Orden de columnas: parte del guardado del usuario, reconciliado con las columnas
  // que existen hoy (una columna agregada después va al final, una eliminada se descarta).
  const allColumnIds = React.useMemo(
    () => columns.map((column) => (column.id ?? (column as { accessorKey?: string }).accessorKey ?? '') as string),
    [columns]
  );

  const [columnOrder, setColumnOrder] = React.useState<string[]>(() =>
    enableColumnReorder ? reconcileColumnOrder(initialColumnOrder, allColumnIds) : []
  );

  // Estado de visibilidad de filtros.
  // Al inicializar, forzamos a "visible" cualquier columna que tenga un filtro activo en la URL
  // aunque no esté en las preferencias guardadas del usuario. Esto evita el estado "fantasma"
  // donde la tabla filtra datos pero no muestra ningún chip visible al usuario.
  // IMPORTANTE: no se persiste en BD — solo vive en memoria mientras dure la sesión.
  const [filterVisibility, setFilterVisibility] = React.useState<Record<string, boolean>>(() => {
    const activeColumnIds = getActiveFilterColumnIds(searchParams ?? {}, facetedFilters);
    if (activeColumnIds.size === 0) return initialFilterVisibility;

    // Combinar: preferencias del usuario base + forzar true para columnas activas
    const merged: Record<string, boolean> = { ...initialFilterVisibility };
    activeColumnIds.forEach((columnId) => {
      // Solo forzar visible si la columna existe en la configuración de filtros
      const isKnownFilter = facetedFilters.some((f) => f.columnId === columnId);
      if (isKnownFilter && merged[columnId] !== true) {
        merged[columnId] = true;
      }
    });
    return merged;
  });

  // Hook para manejar estado sincronizado con URL
  const filterableColumns = facetedFilters.map((f) => f.columnId);
  const {
    state,
    pagination,
    sorting,
    columnFilters,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange,
    onGlobalFilterChange,
    resetFilters,
    isPending: isNavigationPending,
    startTransition,
    notifyUrlChange,
    urlVersion,
  } = useDataTable({
    filterableColumns,
    tableId: paramNamespace,
    clientSideNavigation: isClientSide,
    defaultPageSize: initialPageSize,
    defaultSorting: initialSorting,
  });

  // ---- Client-side data fetching (cuando queryFn está presente) ----

  // Defaults efectivos de la vista (preferencias del usuario o defaults del sistema).
  // Se serializa el sorting para tener una dependencia estable entre renders.
  const defaultPageSize = initialPageSize ?? DEFAULT_PAGE_SIZE;
  const defaultSort = serializeSorting(initialSorting);

  // Convertir state a DataTableSearchParams para queryFn y onStateChange.
  // `pageSize` y `sort` se escriben SIEMPRE (aunque la URL los omita por coincidir
  // con el default guardado) para que el fetch reciba el estado real de la vista.
  const stateSearchParams = React.useMemo(() => {
    const urlParams = stateToSearchParams(state, { defaultPageSize, defaultSort });
    const obj: DataTableSearchParams = {};
    urlParams.forEach((v, k) => {
      obj[k] = v;
    });
    obj.pageSize = String(state.pageSize);
    obj.sort = serializeSorting(state.sorting);
    return obj;
  }, [state, defaultPageSize, defaultSort]);

  // Derivar facetParams (sin page/sort) para lazy-load de facets individuales
  const facetParams = React.useMemo(() => {
    const { page, pageSize, sort, sortBy, sortOrder, ...rest } = stateSearchParams;
    return rest;
  }, [stateSearchParams]);

  // Detectar si hay filtros activos en el estado (incluyendo _from/_to de dateRange).
  // Esto se usa para activar el botón "Limpiar filtros" independientemente de si las
  // columnas están visibles en el toolbar o no.
  const hasActiveFilters = React.useMemo(() => {
    return Object.entries(state.filters).some(([, values]) => values.length > 0);
  }, [state.filters]);

  // Notificar al padre cuando el estado cambia (para facets y queries dependientes)
  const onStateChangeRef = React.useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  React.useEffect(() => {
    onStateChangeRef.current?.(stateSearchParams);
  }, [stateSearchParams]);

  // React Query para fetch client-side.
  //
  // Next.js despacha las Server Actions de a UNA por cliente (documentado: "Next.js
  // dispatches Server Actions one at a time per client"). Una página con muchas tablas en
  // client-side mode (ej. /dashboard/maintenance monta ~25 a la vez, una por tab) dispara
  // ~25 server actions en fila apenas monta si cada tabla re-pide al montar los mismos datos
  // que el SSR ya le entregó por props — cualquier facet que el usuario abra mientras tanto
  // espera detrás de toda esa cola serial (medido: >30s para drenarla).
  //
  // Por eso SÍ sembramos el cache con `initialData`, pero SOLO para la query key que
  // corresponde al estado con el que el SSR renderizó esta tabla (capturado una única vez,
  // en `initialQueryStateKeyRef`, en el primer render de este componente). React Query
  // evalúa `initialData` por query key: en cuanto el usuario cambia un filtro/página/orden,
  // la key cambia, `isInitialQueryState` pasa a false y esa key nueva no tiene `initialData`
  // → fetch real como siempre. `placeholderData: keepPreviousData` sigue cubriendo esas
  // transiciones (muestra los datos anteriores mientras carga los nuevos).
  //
  // IMPORTANTE: `data`/`totalRows` NO siempre son datos reales de SSR — varios usos (diálogos
  // client-only: AvailableEmployeesDialog, EmployeeSelectorDialog, etc.) pasan `data={[]}`/
  // `totalRows={0}` como placeholder mientras resuelven SU PROPIO useQuery externo, y dependen
  // 100% del `queryFn` de este componente para traer los datos reales. Si sembráramos
  // `initialData` con ese placeholder, la tabla quedaría mostrando "vacío" indefinidamente: una
  // vez que React Query tiene datos "success" para una key (aunque sea el placeholder), un
  // propData nuevo que llegue después NO lo reemplaza (`tableData` prioriza `queryResult.data`
  // sobre `propData`) y, al no estar la key stale, tampoco se refetchea solo. Por eso solo se
  // siembra cuando hay evidencia de que `propData`/`propTotalRows` son datos reales (no vacíos):
  // en el peor caso (un SSR real cuya primera página da 0 resultados) simplemente no se aplica
  // la optimización y la tabla hace su fetch normal, igual que antes de este cambio.
  const hasRealInitialData = propTotalRows > 0 || propData.length > 0;

  const initialMountAtRef = React.useRef<number | null>(null);
  if (initialMountAtRef.current === null) {
    initialMountAtRef.current = Date.now();
  }

  const stateSearchParamsKey = React.useMemo(() => JSON.stringify(stateSearchParams), [stateSearchParams]);

  const initialQueryStateKeyRef = React.useRef<string | null>(null);
  if (initialQueryStateKeyRef.current === null) {
    initialQueryStateKeyRef.current = stateSearchParamsKey;
  }
  const isInitialQueryState = stateSearchParamsKey === initialQueryStateKeyRef.current && hasRealInitialData;

  const {
    data: queryResult,
    isPlaceholderData,
    isError: isQueryError,
    isFetching: isQueryFetching,
    refetch,
  } = useQuery({
    queryKey: [...(queryKeyProp ?? ['data-table']), stateSearchParams],
    queryFn: () => queryFn!(stateSearchParams),
    placeholderData: keepPreviousData,
    enabled: isRemoteQuery,
    // Acotado (no Infinity): pasado este tiempo, volver a esta key (incluida la inicial)
    // dispara un refetch normal en vez de confiar para siempre en el dato sembrado/cacheado.
    staleTime: queryStaleTimeMs,
    ...(isInitialQueryState
      ? {
          initialData: () => ({ data: propData, total: propTotalRows }),
          initialDataUpdatedAt: initialMountAtRef.current,
        }
      : {}),
  });

  // Datos finales para la tabla
  // Error de carga (solo client-side mode con queryFn). Si no hay datos nuevos NO se cae al SSR
  // inicial (`propData`): serían datos de otro estado de filtros presentados como actuales.
  const hasLoadError = isRemoteQuery && isQueryError;
  const hasNoResultOnError = hasLoadError && queryResult === undefined;
  const hasStaleDataOnError = hasLoadError && queryResult !== undefined;
  const emptyData = React.useMemo<TData[]>(() => [], []);
  const tableData = isRemoteQuery ? (hasNoResultOnError ? emptyData : queryResult?.data ?? propData) : propData;
  const tableTotalRows = isRemoteQuery
    ? hasNoResultOnError
      ? 0
      : queryResult?.total ?? propTotalRows
    : propTotalRows;
  // isPlaceholderData = true SOLO cuando se muestra data stale de un query key anterior
  // (mientras se fetch data nueva). false cuando se muestra data real del cache → sin efecto disabled.
  // En in-memory nunca hay fetch ni navegación: el estado se resuelve de forma síncrona.
  const isPending = isRemoteQuery ? isPlaceholderData : isInMemory ? false : isNavigationPending;

  // Calcular pageCount basado en totalRows (en in-memory lo calcula TanStack sobre las filas filtradas)
  const pageCount = Math.ceil(tableTotalRows / pagination.pageSize);

  // En in-memory la búsqueda global se maneja con `globalFilter`, no como un filtro de columna:
  // el id 'global' no corresponde a ninguna columna y TanStack no sabría resolverlo.
  const tableColumnFilters = React.useMemo(
    () => (isInMemory ? columnFilters.filter((filter) => filter.id !== 'global') : columnFilters),
    [columnFilters, isInMemory]
  );

  // Configurar tabla con TanStack Table
  const table = useReactTable({
    data: tableData,
    columns,
    // En in-memory lo calcula TanStack a partir de las filas que sobreviven a los filtros
    ...(isInMemory ? {} : { pageCount }),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters: tableColumnFilters,
      pagination,
      ...(isInMemory ? { globalFilter: state.search } : {}),
      ...(enableColumnReorder ? { columnOrder } : {}),
    },
    onColumnOrderChange: setColumnOrder,
    // Row IDs estables: si el dato tiene `id`, usarlo; si no, usar el índice.
    // Esto evita que la selección "salte" a otras filas al cambiar de página o re-fetch.
    getRowId: (row, index) => {
      const maybeId = (row as { id?: string | number }).id;
      return typeof maybeId === 'string' || typeof maybeId === 'number' ? String(maybeId) : String(index);
    },
    // Row selection
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(newSelection);

      // Callback con IDs (cross-page): las claves del map son IDs gracias a getRowId.
      if (onRowSelectionIdsChange) {
        const ids = Object.keys(newSelection).filter((key) => newSelection[key as keyof typeof newSelection]);
        onRowSelectionIdsChange(ids);
      }

      // Callback con filas (solo página actual): para compatibilidad con consumers
      // existentes que necesitan los objetos completos.
      if (onRowSelectionChange) {
        const rowsById = new Map<string, TData>();
        for (const r of tableData) {
          const maybeId = (r as { id?: string | number }).id;
          if (typeof maybeId === 'string' || typeof maybeId === 'number') {
            rowsById.set(String(maybeId), r);
          }
        }
        const selectedRows: TData[] = [];
        for (const key of Object.keys(newSelection)) {
          if (!newSelection[key as keyof typeof newSelection]) continue;
          const fromCurrentPage = rowsById.get(key);
          if (fromCurrentPage) selectedRows.push(fromCurrentPage);
        }
        onRowSelectionChange(selectedRows);
      }
    },
    // Column visibility (local)
    onColumnVisibilityChange: setColumnVisibility,
    // Paginación server-side (en in-memory la resuelve getPaginationRowModel)
    manualPagination: !isInMemory,
    onPaginationChange,
    // Sorting server-side (multi-sort habilitado; en in-memory lo resuelve getSortedRowModel)
    manualSorting: !isInMemory,
    enableMultiSort: true,
    isMultiSortEvent: (e: unknown) => (e as KeyboardEvent).shiftKey,
    onSortingChange,
    // Filtrado server-side (en in-memory lo resuelve getFilteredRowModel)
    manualFiltering: !isInMemory,
    onColumnFiltersChange,
    // Row models
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    // Row models del modo in-memory. La página ya se resetea desde useDataTable al
    // filtrar u ordenar, así que autoResetPageIndex queda apagado para no escribir
    // la URL por cuenta propia al montar o al cambiar el dataset.
    ...(isInMemory
      ? {
          getFilteredRowModel: getFilteredRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          globalFilterFn: 'includesString' as const,
          autoResetPageIndex: false,
        }
      : {}),
  });

  // Filas que sobreviven a los filtros — es el total real a mostrar en el pie en modo in-memory.
  const displayedTotalRows = isInMemory ? table.getFilteredRowModel().rows.length : tableTotalRows;

  // En in-memory el Excel sale de las filas ya filtradas y ordenadas (el botón promete
  // "todos los datos filtrados"), no del dataset completo que llegó por props.
  const effectiveExportConfig = React.useMemo(() => {
    if (!exportConfig || !isInMemory) return exportConfig;
    return {
      ...exportConfig,
      fetchAllData: async () => table.getSortedRowModel().rows.map((row) => row.original),
    };
  }, [exportConfig, isInMemory, table]);

  // Persistir visibilidad de columnas con debounce de 1 segundo
  React.useEffect(() => {
    if (!tableId) return;

    const timer = setTimeout(() => {
      saveTableColumnVisibility(tableId, columnVisibility);
    }, 1000);

    return () => clearTimeout(timer);
  }, [columnVisibility, tableId]);

  // Persistir filas por página y ordenamiento con debounce de 1 segundo.
  // Solo se guarda cuando el usuario cambia la vista respecto de lo ya guardado,
  // para no escribir preferencias que el usuario nunca eligió.
  const savedViewRef = React.useRef({ pageSize: defaultPageSize, sort: defaultSort });

  React.useEffect(() => {
    if (!tableId || !persistViewPreferences) return;

    const timer = setTimeout(() => {
      const sort = serializeSorting(state.sorting);
      if (state.pageSize === savedViewRef.current.pageSize && sort === savedViewRef.current.sort) return;

      savedViewRef.current = { pageSize: state.pageSize, sort };
      saveTableViewPreferences(tableId, { pageSize: state.pageSize, sorting: state.sorting });
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.pageSize, state.sorting, tableId, persistViewPreferences]);

  // Persistir el orden de columnas con debounce de 1 segundo (solo si el usuario lo cambió).
  const savedColumnOrderRef = React.useRef(columnOrder.join(','));

  React.useEffect(() => {
    if (!tableId || !enableColumnReorder) return;

    const timer = setTimeout(() => {
      const serialized = columnOrder.join(',');
      if (serialized === savedColumnOrderRef.current) return;

      savedColumnOrderRef.current = serialized;
      saveTableColumnOrder(tableId, columnOrder);
    }, 1000);

    return () => clearTimeout(timer);
  }, [columnOrder, tableId, enableColumnReorder]);

  // Reset externo de la selección (skip initial render para no disparar al montar).
  const skipFirstClearRef = React.useRef(true);
  React.useEffect(() => {
    if (clearSelectionTrigger === undefined) return;
    if (skipFirstClearRef.current) {
      skipFirstClearRef.current = false;
      return;
    }
    setRowSelection({});
  }, [clearSelectionTrigger]);

  return (
    <DataTablePendingProvider
      value={{
        isPending,
        startTransition,
        isClientSide,
        notifyUrlChange,
        urlVersion,
      }}
    >
      <div className="space-y-4" data-testid={dataTestId}>
        {/* Toolbar */}
        <DataTableToolbar
          table={table}
          enableColumnReorder={enableColumnReorder}
          searchPlaceholder={searchPlaceholder}
          searchColumn={searchColumn}
          facetedFilters={facetedFilters}
          showColumnToggle={showColumnToggle}
          tableId={tableId}
          showFilterToggle={showFilterToggle}
          filterVisibility={filterVisibility}
          onFilterVisibilityChange={setFilterVisibility}
          paramNamespace={paramNamespace}
          isFetchingFacets={isFetchingFacets}
          facetParams={facetParams}
          facetScope={queryKeyProp}
          onSearchChange={onGlobalFilterChange}
          searchValue={state.search}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          exportActions={
            effectiveExportConfig && showExportButton ? (
              <_DataTableExportButton columns={columns} exportConfig={effectiveExportConfig} />
            ) : undefined
          }
          toolbarActions={toolbarActions}
          showSearch={showSearch}
        />

        {/* Error de carga: conserva toolbar y filtros para poder cambiarlos o reintentar */}
        {hasLoadError && (
          <DataTableError
            onRetry={() => void refetch()}
            isRetrying={isQueryFetching}
            hasStaleData={hasStaleDataOnError}
          />
        )}

        {/* Table */}
        {!hasNoResultOnError && (
        <div className={cn('overflow-auto rounded-md border max-h-[60vh]', mobileCards && MOBILE_CARDS_WRAPPER)}>
          <Table containerClassName="overflow-x-visible overflow-y-visible min-w-fit max-md:min-w-0">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className="sticky top-0 z-10 dark:bg-slate-900 bg-white"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody
              className={cn(
                'transition-opacity duration-150',
                isPending && 'opacity-50 pointer-events-none',
                hasStaleDataOnError && !isPending && 'opacity-60'
              )}
              data-stale={hasStaleDataOnError ? 'true' : undefined}
            >
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    data-testid={`table-row-${row.id}`}
                    className={rowClassName ? rowClassName(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        data-label={(cell.column.columnDef.meta as { title?: string } | undefined)?.title}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        )}

        {/* Pagination */}
        <DataTablePagination
          table={table}
          totalRows={displayedTotalRows}
          pageSizeOptions={pageSizeOptions}
          showRowSelection={showRowSelection && Boolean(enableRowSelection)}
        />
      </div>
    </DataTablePendingProvider>
  );
}
