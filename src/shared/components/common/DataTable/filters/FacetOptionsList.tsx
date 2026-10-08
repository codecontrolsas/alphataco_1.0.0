'use client';

import { Check } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { FacetFilterState } from './use-facet-filter';

interface FacetOptionsListProps {
  title: string;
  state: FacetFilterState;
  className?: string;
}

/**
 * Cuerpo del filtro faceteado (buscador + opciones + "Limpiar filtros").
 * Reusable en el popover de escritorio y en el acordeón de filtros mobile.
 */
export function FacetOptionsList({ title, state, className }: FacetOptionsListProps) {
  const {
    columnId,
    isLazy,
    isLazyFetching,
    isFetching,
    isRefetching,
    hasLazyData,
    visibleOptions,
    facets,
    selectedValues,
    toggleValue,
    clear,
  } = state;

  return (
    <Command className={className}>
      <CommandInput placeholder={`Buscar ${title.toLowerCase()}...`} />
      <CommandList>
        {/* Skeleton: se muestra cuando está cargando Y no hay opciones */}
        {(isFetching || (isLazy && isLazyFetching && !hasLazyData)) && visibleOptions.length === 0 ? (
          <CommandGroup>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <Skeleton className="h-4 w-20 rounded-sm" />
                <Skeleton className="ml-auto h-4 w-6 rounded-sm" />
              </div>
            ))}
          </CommandGroup>
        ) : (
          <>
            {/* Ocultar "Sin resultados" durante el fetching para evitar flash */}
            {!isFetching && !isLazyFetching && <CommandEmpty>Sin resultados.</CommandEmpty>}
            <CommandGroup className={cn(isRefetching && 'opacity-60 transition-opacity')}>
              {visibleOptions.map((option) => {
                const isSelected = selectedValues.has(option.value);
                const count = facets?.get(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggleValue(option.value)}
                    className="min-h-8"
                    data-testid={`filter-option-${option.value}`}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                    {option.icon && <option.icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 truncate">{option.label}</span>
                    {count ? (
                      <span className="ml-auto flex min-w-4 shrink-0 items-center justify-end pl-2 font-mono text-caption tabular-nums">
                        {count}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
        {selectedValues.size > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={clear}
                className="justify-center text-center"
                data-testid={`filter-clear-${columnId}`}
              >
                Limpiar filtros
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
