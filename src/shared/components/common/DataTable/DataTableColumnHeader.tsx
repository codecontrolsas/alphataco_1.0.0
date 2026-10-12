'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff, ListOrdered, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { DataTableColumnHeaderProps } from './types';

/**
 * Header de columna con soporte para sorting (single y multi) y ocultamiento
 *
 * - Click normal en Asc/Desc: reemplaza todo el sorting con esta columna
 * - Shift+Click en Asc/Desc: agrega al multi-sort
 * - "Sin ordenar": quita esta columna del sorting
 * - "Agregar al ordenamiento": agrega al multi-sort (Asc)
 *
 * La flecha de 12px solo se ve en la columna ordenada; en reposo no hay ícono y, en hover o foco, aparece
 * `ChevronsUpDown` para indicar que se puede ordenar. Con multi-sort se muestra el índice de orden (1, 2, 3...).
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sortIndex = column.getSortIndex();
  const isSorted = column.getIsSorted();

  return (
    <div className={cn('flex items-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="group -mx-3 h-8 gap-1.5 rounded-md px-3 text-overline text-inherit data-[state=open]:bg-accent"
            data-testid={`column-header-${column.id}`}
          >
            <span>{title}</span>
            {isSorted === 'desc' ? (
              <ArrowDown aria-hidden="true" className="size-3" />
            ) : isSorted === 'asc' ? (
              <ArrowUp aria-hidden="true" className="size-3" />
            ) : (
              <ChevronsUpDown
                aria-hidden="true"
                className="size-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100"
              />
            )}
            {/* Índice de multi-sort */}
            {sortIndex >= 0 && (
              <span className="flex size-4 items-center justify-center bg-primary-soft font-mono text-[10px] font-semibold text-primary tabular-nums">
                {sortIndex + 1}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={(e) => column.toggleSorting(false, e.shiftKey)}
            data-testid={`sort-asc-${column.id}`}
          >
            <ArrowUp className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Ascendente
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => column.toggleSorting(true, e.shiftKey)}
            data-testid={`sort-desc-${column.id}`}
          >
            <ArrowDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Descendente
          </DropdownMenuItem>
          {/* Agregar al multi-sort sin necesidad de Shift */}
          {!isSorted && (
            <DropdownMenuItem onClick={() => column.toggleSorting(false, true)} data-testid={`sort-multi-${column.id}`}>
              <ListOrdered className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
              Agregar al ordenamiento
            </DropdownMenuItem>
          )}
          {isSorted && (
            <DropdownMenuItem onClick={() => column.clearSorting()} data-testid={`sort-clear-${column.id}`}>
              <X className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
              Sin ordenar
            </DropdownMenuItem>
          )}
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)} data-testid={`hide-column-${column.id}`}>
                <EyeOff className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                Ocultar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
