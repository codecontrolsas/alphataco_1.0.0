'use client';

import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { saveTableFilterVisibility } from '@/shared/actions/table-preferences';

import { useDataTablePending } from './DataTablePendingContext';
import type { DataTableFacetedFilterConfig } from './types';

export interface DataTableFilterOptionsProps {
  filters: DataTableFacetedFilterConfig[];
  filterVisibility: Record<string, boolean>;
  onFilterVisibilityChange: (visibility: Record<string, boolean>) => void;
  tableId: string;
  /** Cantidad de filtros activos (incluye fechas y columnas ocultas). Con 0 el botón dice solo "Filtros". */
  activeCount?: number;
  /** Si se pasa, suma "Limpiar filtros" al pie del menú. */
  onClearFilters?: () => void;
}

/**
 * Alterna la visibilidad de un filtro y la persiste. Es la lógica de siempre, compartida entre el
 * menú de desktop y la lista del ⋯ mobile.
 */
export function useFilterVisibilityToggle({
  filterVisibility,
  onFilterVisibilityChange,
  tableId,
}: Pick<DataTableFilterOptionsProps, 'filterVisibility' | 'onFilterVisibilityChange' | 'tableId'>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition } = useDataTablePending();

  return (columnId: string, visible: boolean) => {
    const newVisibility = { ...filterVisibility, [columnId]: visible };
    onFilterVisibilityChange(newVisibility);

    // Si se oculta, limpiar el param de URL correspondiente
    if (!visible) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(columnId);
      params.delete(`${columnId}_from`);
      params.delete(`${columnId}_to`);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }

    // Guardar en DB (fire and forget)
    saveTableFilterVisibility(tableId, newVisibility);
  };
}

export function DataTableFilterOptions({
  filters,
  filterVisibility,
  onFilterVisibilityChange,
  tableId,
  activeCount = 0,
  onClearFilters,
}: DataTableFilterOptionsProps) {
  const toggleFilter = useFilterVisibilityToggle({ filterVisibility, onFilterVisibilityChange, tableId });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" data-testid="filter-options">
          Filtros
          {activeCount > 0 && <span className="tabular-nums">({activeCount})</span>}
          <ChevronDown className="size-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Mostrar filtros</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filters.map((filter) => {
          const isVisible = filterVisibility[filter.columnId] !== false;
          return (
            <DropdownMenuCheckboxItem
              key={filter.columnId}
              checked={isVisible}
              onCheckedChange={(value) => toggleFilter(filter.columnId, !!value)}
            >
              {filter.title}
            </DropdownMenuCheckboxItem>
          );
        })}
        {onClearFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={activeCount === 0} onSelect={onClearFilters}>
              Limpiar filtros
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Lista de "Mostrar filtros" sin disparador, para el diálogo del ⋯ mobile. Misma persistencia que el menú. */
export function DataTableFilterVisibilityList({
  filters,
  filterVisibility,
  onFilterVisibilityChange,
  tableId,
}: DataTableFilterOptionsProps) {
  const toggleFilter = useFilterVisibilityToggle({ filterVisibility, onFilterVisibilityChange, tableId });
  const fieldId = React.useId();

  return (
    <ul className="px-2 py-2">
      {filters.map((filter) => {
        const checkboxId = `${fieldId}-${filter.columnId}`;
        return (
          <li key={filter.columnId} className="flex items-center gap-2 py-0.5 pl-2 pr-1">
            <Checkbox
              id={checkboxId}
              checked={filterVisibility[filter.columnId] !== false}
              onCheckedChange={(value) => toggleFilter(filter.columnId, !!value)}
            />
            <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate py-2.5 text-sm">
              {filter.title}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
