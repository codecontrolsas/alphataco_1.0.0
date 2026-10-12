'use client';

import { Search, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { DataTableActiveFilterChip } from './DataTableActiveFilterChip';
import { DataTableDateRangeFilter } from './DataTableDateRangeFilter';
import { DataTableFacetedFilter } from './DataTableFacetedFilter';
import { DataTableFilterOptions } from './DataTableFilterOptions';
import { useDataTablePending } from './DataTablePendingContext';
import { DataTableTextFilter } from './DataTableTextFilter';
import { DataTableViewOptions } from './DataTableViewOptions';
import { getColumnTitle } from './mobile-columns';
import type { DataTableFacetedFilterConfig, DataTableFilterVariant, DataTableToolbarProps } from './types';

/**
 * Piezas que la integración (ola 2) monta en la fila mobile. Todas son opcionales: sin ellas la toolbar
 * se comporta igual que en desktop (los filtros y botones quedan visibles también en pantallas angostas).
 */
export interface DataTableToolbarSlots {
  /** Botón "Filtros (n)" que abre el sheet de filtros mobile. Con él, los filtros inactivos se ocultan bajo `@3xl/table`. */
  mobileFiltersTrigger?: React.ReactNode;
  /** Botón "Ordenar por" mobile. */
  mobileSort?: React.ReactNode;
  /** ⋯ mobile (`DataTableMoreMenu`). Con él, "Columnas" y "Exportar" se ocultan bajo `@3xl/table`. */
  moreMenu?: React.ReactNode;
}

/**
 * Ids de los filtros con valor, leídos de la URL con las mismas claves que escriben los filtros
 * (`ns__col`, `ns__col_from`/`_to`). Incluye los de columnas ocultas, que no tienen control visible.
 */
export function useActiveFilterIds(filters: DataTableFacetedFilterConfig[], paramNamespace?: string): Set<string> {
  const searchParams = useSearchParams();
  const { isClientSide, urlVersion } = useDataTablePending();

  return React.useMemo(() => {
    const params =
      isClientSide && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(searchParams.toString());
    const prefix = paramNamespace ? `${paramNamespace}__` : '';
    const active = new Set<string>();

    for (const filter of filters) {
      const hasValue =
        filter.type === 'dateRange'
          ? !!(params.get(`${prefix}${filter.columnId}_from`) || params.get(`${prefix}${filter.columnId}_to`))
          : !!params.get(`${prefix}${filter.columnId}`);
      if (hasValue) active.add(filter.columnId);
    }

    return active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlVersion fuerza la relectura en client-side mode
  }, [filters, paramNamespace, isClientSide, searchParams, urlVersion]);
}

/**
 * Barra de herramientas: buscador, filtros (botón o chip según estén activos), orden, limpiar y acciones.
 *
 * Es un solo DOM que se reacomoda por container query (`@3xl/table`): en desktop todo en una fila con
 * wrap; en mobile, buscador a ancho completo, fila de acciones y tira de chips de filtros activos.
 */
export function DataTableToolbar<TData>({
  table,
  enableColumnReorder = false,
  searchPlaceholder = 'Buscar...',
  searchColumn,
  facetedFilters = [],
  showColumnToggle = true,
  toolbarActions,
  exportActions,
  showSearch = false,
  tableId,
  showFilterToggle = false,
  filterVisibility = {},
  onFilterVisibilityChange,
  paramNamespace,
  isFetchingFacets,
  facetParams,
  facetScope,
  onSearchChange,
  searchValue: externalSearchValue,
  hasActiveFilters: externalHasActiveFilters,
  onResetFilters,
  mobileFiltersTrigger,
  mobileSort,
  moreMenu,
}: DataTableToolbarProps<TData> & DataTableToolbarSlots) {
  // isFiltered: true si hay columnFilters en TanStack Table (faceted / búsqueda).
  // externalHasActiveFilters: true si hay cualquier filtro activo en el estado de URL,
  // incluyendo dateRange (_from/_to) y filtros de columnas no visibles en el toolbar.
  // Combinamos ambos para que el botón "Limpiar filtros" cubra todos los casos.
  const isFiltered = table.getState().columnFilters.length > 0 || (externalHasActiveFilters ?? false);
  const sortingState = table.getState().sorting;
  const isSorted = sortingState.length > 0;

  const activeFilterIds = useActiveFilterIds(facetedFilters, paramNamespace);
  const activeCount = activeFilterIds.size;

  // Si se provee onSearchChange (búsqueda sincronizada con URL/servidor),
  // usar el valor externo (searchValue prop). De lo contrario, usar estado local de TanStack.
  const searchValue =
    externalSearchValue !== undefined
      ? externalSearchValue
      : searchColumn
        ? (table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''
        : (table.getState().globalFilter as string) ?? '';

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      // Ruta preferida: sincronizar búsqueda con URL para re-fetch server-side
      onSearchChange(value);
    } else if (searchColumn) {
      table.getColumn(searchColumn)?.setFilterValue(value);
    } else {
      table.setGlobalFilter(value);
    }
  };

  const clearFilters = () => {
    if (onResetFilters) {
      // Limpieza completa: incluye dateRange (_from/_to) y filtros de columnas ocultas
      onResetFilters();
    } else {
      table.resetColumnFilters();
    }
  };

  // Filtros visibles (excluir los que estan ocultos). Facetados primero; texto y fecha después.
  const visibleFilters = facetedFilters.filter((f) => filterVisibility[f.columnId] !== false);
  const primaryFilters = visibleFilters.filter((f) => f.type !== 'text' && f.type !== 'dateRange');
  const secondaryFilters = visibleFilters.filter((f) => f.type === 'text' || f.type === 'dateRange');

  const hasMobileFilters = !!mobileFiltersTrigger;
  const hasMobileMenu = !!moreMenu;

  // Chip de orden: "Orden: Fecha ↓" o "Orden (2)" con multi-sort.
  const firstSort = sortingState[0];
  const firstSortColumn = firstSort ? table.getColumn(firstSort.id) : undefined;
  const sortValue = firstSort
    ? `${firstSortColumn ? getColumnTitle(firstSortColumn) : firstSort.id} ${firstSort.desc ? '↓' : '↑'}`
    : '';
  const isMultiSort = sortingState.length > 1;

  // Los filtros inactivos solo se ocultan en mobile cuando existe el sheet que los reemplaza.
  const filterWrapperClass = (isActive: boolean) =>
    cn('shrink-0', !isActive && hasMobileFilters && 'hidden @3xl/table:block');

  const renderFilter = (filter: DataTableFacetedFilterConfig) => {
    const isActive = activeFilterIds.has(filter.columnId);
    const variant: DataTableFilterVariant = isActive ? 'chip' : 'trigger';

    if (filter.type === 'dateRange') {
      return (
        <div key={filter.columnId} className={filterWrapperClass(isActive)}>
          <DataTableDateRangeFilter
            columnId={filter.columnId}
            title={filter.title}
            paramNamespace={paramNamespace}
            variant={variant}
          />
        </div>
      );
    }

    if (filter.type === 'text') {
      return (
        <div key={filter.columnId} className={filterWrapperClass(isActive)}>
          <DataTableTextFilter
            columnId={filter.columnId}
            title={filter.title}
            placeholder={filter.placeholder}
            paramNamespace={paramNamespace}
            variant={variant}
          />
        </div>
      );
    }

    const column = table.getColumn(filter.columnId);
    if (!column) return null;

    return (
      <div key={filter.columnId} className={filterWrapperClass(isActive)}>
        <DataTableFacetedFilter
          column={column}
          title={filter.title}
          options={filter.options ?? []}
          externalCounts={filter.externalCounts}
          disabled={filter.disabled}
          isFetching={isFetchingFacets}
          fetchFacet={filter.fetchFacet}
          facetParams={facetParams}
          facetScope={facetScope}
          variant={variant}
        />
      </div>
    );
  };

  const showFilterOptions = showFilterToggle && !!tableId && facetedFilters.length > 0 && !!onFilterVisibilityChange;
  // Con el ⋯ montado, lo que vive ahí no se repite como botón en mobile.
  const desktopOnlyClass = hasMobileMenu ? 'hidden @3xl/table:contents' : 'contents';

  // Tira de filtros: con el sheet mobile solo se ve en mobile si hay chips activos.
  const filtersGroupClass = hasMobileFilters
    ? cn(
        'scroll-fade-x w-full flex-nowrap overflow-x-auto @3xl/table:w-auto @3xl/table:flex-wrap @3xl/table:overflow-visible',
        activeCount > 0 ? 'flex' : 'hidden @3xl/table:flex'
      )
    : 'flex flex-wrap';

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 @3xl/table:min-h-12">
      {/* Buscador */}
      {showSearch && (
        <div className="relative order-1 w-full @3xl/table:w-64 @3xl/table:shrink-0">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="h-11 w-full max-w-full pl-8 text-base @3xl/table:h-8 @3xl/table:text-sm"
            data-testid="search-input"
          />
        </div>
      )}

      {/* Filtros, orden y limpiar. La base de 16rem evita que el grupo se encoja por debajo de su contenido y se monte sobre las acciones. */}
      <div
        className={cn(
          'order-3 min-w-0 items-center gap-2 @3xl/table:order-2 @3xl/table:flex-[1_1_16rem]',
          filtersGroupClass
        )}
      >
        {primaryFilters.map(renderFilter)}
        {secondaryFilters.map(renderFilter)}

        {/* Chip de orden: la ✕ conserva el testid para "limpiar orden" */}
        {isSorted && (
          <DataTableActiveFilterChip
            label={isMultiSort ? `Orden (${sortingState.length})` : 'Orden'}
            value={isMultiSort ? undefined : sortValue}
            valueTitle={isMultiSort ? undefined : sortValue}
            removeLabel="Quitar orden"
            onRemove={() => table.resetSorting()}
            removeTestId="clear-sorting"
            className={hasMobileFilters ? 'hidden @3xl/table:inline-flex' : undefined}
          />
        )}

        {/* Boton para limpiar filtros */}
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className={hasMobileFilters ? 'hidden @3xl/table:inline-flex' : undefined}
            data-testid="clear-filters"
          >
            Limpiar filtros
            <X className="size-3" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Acciones */}
      <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-2 @3xl/table:order-3 @3xl/table:ml-auto @3xl/table:w-auto">
        {hasMobileFilters && <div className="flex items-center gap-2 @3xl/table:hidden">{mobileFiltersTrigger}</div>}
        {mobileSort && <div className="flex min-w-0 max-w-full items-center gap-2 @3xl/table:hidden">{mobileSort}</div>}

        <div className={desktopOnlyClass}>
          {showFilterOptions && (
            <div className={hasMobileFilters ? 'hidden @3xl/table:block' : 'block'}>
              <DataTableFilterOptions
                filters={facetedFilters}
                filterVisibility={filterVisibility}
                onFilterVisibilityChange={onFilterVisibilityChange}
                tableId={tableId}
                activeCount={activeCount}
                onClearFilters={isFiltered ? clearFilters : undefined}
              />
            </div>
          )}
          {showColumnToggle && <DataTableViewOptions table={table} enableColumnReorder={enableColumnReorder} />}
          {exportActions}
        </div>

        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 @3xl/table:ml-0">
          {toolbarActions}
          {moreMenu && <div className="@3xl/table:hidden">{moreMenu}</div>}
        </div>
      </div>
    </div>
  );
}
