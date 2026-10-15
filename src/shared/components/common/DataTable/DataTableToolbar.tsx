'use client';

import { ArrowUpDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import { DataTableDateRangeFilter } from './DataTableDateRangeFilter';
import { DataTableFacetedFilter } from './DataTableFacetedFilter';
import { DataTableFilterOptions } from './DataTableFilterOptions';
import { DataTableTextFilter } from './DataTableTextFilter';
import { DataTableViewOptions } from './DataTableViewOptions';
import type { DataTableToolbarProps } from './types';

/**
 * Barra de herramientas con busqueda, filtros y acciones.
 *
 * Los filtros se organizan en dos zonas visuales:
 * 1. Fila principal: buscador global + filtros facetados (seleccion multiple)
 * 2. Fila secundaria: filtros de texto + filtros de rango de fecha
 *
 * La fila secundaria solo se muestra si hay filtros de ese tipo visibles.
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
}: DataTableToolbarProps<TData>) {
  // isFiltered: true si hay columnFilters en TanStack Table (faceted / búsqueda).
  // externalHasActiveFilters: true si hay cualquier filtro activo en el estado de URL,
  // incluyendo dateRange (_from/_to) y filtros de columnas no visibles en el toolbar.
  // Combinamos ambos para que el botón "Limpiar filtros" cubra todos los casos.
  const isFiltered = table.getState().columnFilters.length > 0 || (externalHasActiveFilters ?? false);
  const sortingState = table.getState().sorting;
  const isSorted = sortingState.length > 0;

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

  // Filtros visibles (excluir los que estan ocultos)
  const visibleFilters = facetedFilters.filter((f) => filterVisibility[f.columnId] !== false);

  // Separar filtros en dos grupos
  const primaryFilters = visibleFilters.filter((f) => f.type !== 'text' && f.type !== 'dateRange');
  const secondaryFilters = visibleFilters.filter((f) => f.type === 'text' || f.type === 'dateRange');

  const hasSecondaryFilters = secondaryFilters.length > 0;

  return (
    // `@container`: la fila decide su layout por el ancho de la propia tabla, no de la ventana,
    // asi una tabla dentro de una tarjeta angosta (o un panel lateral) no desborda la pagina.
    <div className="@container/toolbar space-y-2">
      {/* Fila principal: busqueda + filtros facetados + acciones */}
      <div className="flex flex-col gap-2 @2xl/toolbar:flex-row @2xl/toolbar:items-center @2xl/toolbar:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Input de busqueda */}
          {showSearch && (
            <Input
              type="search"
              name="search"
              autoComplete="off"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="h-9 w-full sm:w-[250px]"
              data-testid="search-input"
            />
          )}

          {/* Filtros facetados (principal) */}
          {primaryFilters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;

            return (
              <DataTableFacetedFilter
                key={filter.columnId}
                column={column}
                title={filter.title}
                options={filter.options ?? []}
                externalCounts={filter.externalCounts}
                disabled={filter.disabled}
                isFetching={isFetchingFacets}
                fetchFacet={filter.fetchFacet}
                facetParams={facetParams}
                facetScope={facetScope}
              />
            );
          })}

          {/* Boton para limpiar ordenamiento */}
          {isSorted && (
            <Button
              variant="ghost"
              onClick={() => table.resetSorting()}
              className="h-9 px-2 lg:px-3"
              data-testid="clear-sorting"
            >
              <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
              {sortingState.length > 1 ? `Ordenamiento (${sortingState.length})` : 'Ordenamiento'}
              <X className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}

          {/* Boton para limpiar filtros */}
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => {
                if (onResetFilters) {
                  // Limpieza completa: incluye dateRange (_from/_to) y filtros de columnas ocultas
                  onResetFilters();
                } else {
                  table.resetColumnFilters();
                }
              }}
              className="h-9 px-2 lg:px-3"
              data-testid="clear-filters"
            >
              Limpiar filtros
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 @2xl/toolbar:shrink-0">
          {exportActions}

          {showFilterToggle && tableId && facetedFilters.length > 0 && onFilterVisibilityChange && (
            <DataTableFilterOptions
              filters={facetedFilters}
              filterVisibility={filterVisibility}
              onFilterVisibilityChange={onFilterVisibilityChange}
              tableId={tableId}
            />
          )}

          {showColumnToggle && <DataTableViewOptions table={table} enableColumnReorder={enableColumnReorder} />}

          {toolbarActions}
        </div>
      </div>

      {/* Fila secundaria: filtros de texto + rango de fecha */}
      {hasSecondaryFilters && (
        <>
          <Separator className="opacity-50" />
          <div className="flex flex-wrap items-center gap-2">
            {secondaryFilters.map((filter) => {
              if (filter.type === 'dateRange') {
                return (
                  <DataTableDateRangeFilter
                    key={filter.columnId}
                    columnId={filter.columnId}
                    title={filter.title}
                    paramNamespace={paramNamespace}
                  />
                );
              }

              if (filter.type === 'text') {
                return (
                  <DataTableTextFilter
                    key={filter.columnId}
                    columnId={filter.columnId}
                    title={filter.title}
                    placeholder={filter.placeholder}
                    paramNamespace={paramNamespace}
                  />
                );
              }

              return null;
            })}
          </div>
        </>
      )}
    </div>
  );
}
