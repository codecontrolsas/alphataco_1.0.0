'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, PlusCircle } from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { DataTableFacetedFilterProps } from './types';

/**
 * Filtro faceteado multi-select para columnas del DataTable.
 *
 * Soporta dos modos:
 * - **Modo bulk** (default): `options` y `externalCounts` vienen como props del padre.
 * - **Modo lazy** (cuando `fetchFacet` está presente): las opciones se cargan on-demand
 *   al abrir el popover por primera vez, con skeleton y cache de React Query.
 */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options: propOptions,
  externalCounts: propExternalCounts,
  disabled,
  isFetching: propIsFetching,
  fetchFacet,
  facetParams,
  facetScope,
}: DataTableFacetedFilterProps<TData, TValue>) {
  // ── Lazy-load state ──────────────────────────────────────────────────────
  const [hasOpened, setHasOpened] = useState(false);
  const isLazy = !!fetchFacet;

  // Si hay valores seleccionados (ej: de URL), eager-load para mostrar labels en el badge
  const selectedFromTable = column?.getFilterValue() as string[] | undefined;
  const hasSelectedValues = (selectedFromTable?.length ?? 0) > 0;

  // React Query interno: solo se activa en modo lazy
  // Con facetScope la key identifica a la tabla: evita que dos tablas montadas a la vez
  // (ej. pestañas de Mantenimiento) compartan el facet de una misma columna.
  // Sin facetScope la key queda como antes. El prefijo 'datatable-facet' se conserva
  // para las invalidaciones existentes.
  const { data: lazyData, isFetching: isLazyFetching } = useQuery({
    queryKey: facetScope
      ? ['datatable-facet', facetScope, column?.id, facetParams]
      : ['datatable-facet', column?.id, facetParams],
    queryFn: () => fetchFacet!(facetParams ?? {}),
    enabled: isLazy && (hasOpened || hasSelectedValues),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  // ── Resolver fuente de datos según modo ──────────────────────────────────
  const options = isLazy ? lazyData?.options ?? [] : propOptions;
  const externalCounts = isLazy ? lazyData?.counts : propExternalCounts;
  const isFetching = isLazy ? isLazyFetching && !lazyData : propIsFetching;

  const facets = externalCounts ?? column?.getFacetedUniqueValues();
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  // Guardar la última versión válida de opciones filtradas para evitar saltos
  // durante el re-fetch (cuando externalCounts se vacía momentáneamente).
  const prevVisibleOptionsRef = useRef(options);

  // Opciones visibles en el popover: si hay externalCounts, filtrar por count > 0.
  // Cuando isFetching es true, conservar las opciones previas para evitar flash vacío.
  let visibleOptions: typeof options;
  if (externalCounts && !isFetching) {
    // Estado normal: filtrar opciones por count > 0
    visibleOptions = options.filter((opt) => (externalCounts.get(opt.value) ?? 0) > 0);
  } else if (isFetching) {
    // Re-fetching: usar las opciones actuales si existen, sino las previas
    visibleOptions = options.length > 0 ? options : prevVisibleOptionsRef.current;
  } else {
    // Sin externalCounts: mostrar todas
    visibleOptions = options;
  }

  // Actualizar ref solo cuando tenemos opciones reales (no vacías)
  if (visibleOptions.length > 0) {
    prevVisibleOptionsRef.current = visibleOptions;
  }

  // El trigger muestra skeleton cuando hay valores seleccionados pero las opciones aún
  // no están disponibles para resolver los labels (recarga de página / lazy-load).
  const selectedLabels = options.filter((opt) => selectedValues.has(opt.value));
  const triggerShowsSkeleton = selectedValues.size > 0 && options.length === 0;

  // En modo lazy, el isFetching para la opacidad del popover solo aplica cuando
  // ya hay datos previos (isPlaceholderData) — no en la carga inicial.
  const isRefetching = isLazy ? isLazyFetching && !!lazyData : propIsFetching;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !hasOpened) setHasOpened(true);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 border-dashed',
            selectedValues.size > 0 &&
              'border-brand bg-brand-subtle text-brand-subtle-foreground hover:bg-brand-subtle border-solid'
          )}
          disabled={disabled}
          data-testid={`filter-${column?.id}`}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              {/* Contador compacto (solo phones < 640px) */}
              <Badge variant="secondary" className="rounded-sm px-1 font-normal sm:hidden">
                {selectedValues.size}
              </Badge>
              {/* Badges con labels (tablets y desktop >= 640px) */}
              <div className="hidden space-x-1 sm:flex">
                {triggerShowsSkeleton ? (
                  // Skeleton mientras las opciones no están disponibles para resolver labels
                  Array.from({ length: Math.min(selectedValues.size, 2) }, (_, i) => (
                    <Skeleton key={i} className="h-5 w-16 rounded-sm" />
                  ))
                ) : selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedValues.size} seleccionados
                  </Badge>
                ) : (
                  selectedLabels.map((option) => (
                    <Badge variant="secondary" key={option.value} className="rounded-sm px-1 font-normal">
                      {option.label}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${title.toLowerCase()}...`} />
          <CommandList>
            {/* Skeleton del popover: se muestra cuando está cargando Y no hay opciones */}
            {(isFetching || (isLazy && isLazyFetching && !lazyData)) && visibleOptions.length === 0 ? (
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
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() => {
                          if (isSelected) {
                            selectedValues.delete(option.value);
                          } else {
                            selectedValues.add(option.value);
                          }
                          const filterValues = Array.from(selectedValues);
                          column?.setFilterValue(filterValues.length ? filterValues : undefined);
                        }}
                        data-testid={`filter-option-${option.value}`}
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </div>
                        {option.icon && <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />}
                        <span>{option.label}</span>
                        {facets?.get(option.value) && (
                          <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                            {facets.get(option.value)}
                          </span>
                        )}
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
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                    data-testid={`filter-clear-${column?.id}`}
                  >
                    Limpiar filtros
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
