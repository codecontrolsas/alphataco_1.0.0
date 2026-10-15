'use client';

import { Check, SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { saveTableFilterVisibility } from '@/shared/actions/table-preferences';

import { useDataTablePending } from './DataTablePendingContext';
import { matchSearchByTitle } from './DataTableViewOptions';
import type { DataTableFacetedFilterConfig } from './types';

interface DataTableFilterOptionsProps {
  filters: DataTableFacetedFilterConfig[];
  filterVisibility: Record<string, boolean>;
  onFilterVisibilityChange: (visibility: Record<string, boolean>) => void;
  tableId: string;
}

export function DataTableFilterOptions({
  filters,
  filterVisibility,
  onFilterVisibilityChange,
  tableId,
}: DataTableFilterOptionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition } = useDataTablePending();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const toggleFilter = (columnId: string, visible: boolean) => {
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

  const visibleCount = filters.filter((filter) => filterVisibility[filter.columnId] !== false).length;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label="Elegir filtros a mostrar">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Filtros</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command filter={matchSearchByTitle} className="h-auto">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar filtro…"
            aria-label="Buscar filtro"
          />
          <CommandList className="max-h-72 overscroll-contain">
            <CommandEmpty>No hay filtros con ese nombre</CommandEmpty>
            <CommandGroup>
              {filters.map((filter) => {
                const isVisible = filterVisibility[filter.columnId] !== false;
                return (
                  <CommandItem
                    key={filter.columnId}
                    value={filter.columnId}
                    keywords={[filter.title]}
                    onSelect={() => toggleFilter(filter.columnId, !isVisible)}
                    data-testid={`toggle-filter-${filter.columnId}`}
                    data-checked={isVisible}
                    className="gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        isVisible
                          ? 'border-primary bg-primary text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-[4px] border'
                          : 'border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border'
                      }
                    >
                      <Check className={isVisible ? 'size-3 text-current' : 'size-3 opacity-0'} />
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={filter.title}>
                      {filter.title}
                    </span>
                    <span className="sr-only">{isVisible ? 'Visible' : 'Oculto'}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <Separator />
        <p className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
          {visibleCount} de {filters.length} {filters.length === 1 ? 'visible' : 'visibles'}
        </p>
      </PopoverContent>
    </Popover>
  );
}
