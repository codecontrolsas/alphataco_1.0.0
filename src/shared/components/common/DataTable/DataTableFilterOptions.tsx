'use client';

import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { saveTableFilterVisibility } from '@/shared/actions/table-preferences';

import { useDataTablePending } from './DataTablePendingContext';
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filtros</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
