'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { DataTableFacetedFilterProps } from '../types';

/** Entradas del hook: las mismas props de datos que ya recibía `DataTableFacetedFilter`. */
export type UseFacetFilterInput<TData, TValue> = Pick<
  DataTableFacetedFilterProps<TData, TValue>,
  'column' | 'options' | 'externalCounts' | 'isFetching' | 'fetchFacet' | 'facetParams' | 'facetScope'
>;

/**
 * Estado de un filtro faceteado (lógica de datos, sin UI).
 *
 * Copia literal de la lógica que vivía en `DataTableFacetedFilter`:
 * - Modo bulk: `options` y `externalCounts` vienen del padre.
 * - Modo lazy (`fetchFacet`): se carga al abrir por primera vez (`markOpened`) o, de forma eager,
 *   si ya hay valores en la URL. La queryKey es la misma, así que el popover y el acordeón mobile
 *   comparten caché.
 */
export function useFacetFilter<TData, TValue>({
  column,
  options: propOptions,
  externalCounts: propExternalCounts,
  isFetching: propIsFetching,
  fetchFacet,
  facetParams,
  facetScope,
}: UseFacetFilterInput<TData, TValue>) {
  const [hasOpened, setHasOpened] = useState(false);
  const isLazy = !!fetchFacet;

  // Si hay valores seleccionados (ej: de URL), eager-load para mostrar labels en el badge
  const selectedFromTable = column?.getFilterValue() as string[] | undefined;
  const hasSelectedValues = (selectedFromTable?.length ?? 0) > 0;

  // Con facetScope la key identifica a la tabla: evita que dos tablas montadas a la vez
  // (ej. pestañas de Mantenimiento) compartan el facet de una misma columna.
  // El prefijo 'datatable-facet' se conserva para las invalidaciones existentes.
  const { data: lazyData, isFetching: isLazyFetching } = useQuery({
    queryKey: facetScope
      ? ['datatable-facet', facetScope, column?.id, facetParams]
      : ['datatable-facet', column?.id, facetParams],
    queryFn: () => fetchFacet!(facetParams ?? {}),
    enabled: isLazy && (hasOpened || hasSelectedValues),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const options = isLazy ? lazyData?.options ?? [] : propOptions;
  const externalCounts = isLazy ? lazyData?.counts : propExternalCounts;
  const isFetching = isLazy ? isLazyFetching && !lazyData : propIsFetching;

  const facets = externalCounts ?? column?.getFacetedUniqueValues();
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  // Guardar la última versión válida de opciones filtradas para evitar saltos
  // durante el re-fetch (cuando externalCounts se vacía momentáneamente).
  const prevVisibleOptionsRef = useRef(options);

  let visibleOptions: typeof options;
  if (externalCounts && !isFetching) {
    visibleOptions = options.filter((opt) => (externalCounts.get(opt.value) ?? 0) > 0);
  } else if (isFetching) {
    visibleOptions = options.length > 0 ? options : prevVisibleOptionsRef.current;
  } else {
    visibleOptions = options;
  }

  if (visibleOptions.length > 0) {
    prevVisibleOptionsRef.current = visibleOptions;
  }

  // Skeleton cuando hay valores seleccionados pero las opciones aún no resuelven los labels.
  const selectedLabels = options.filter((opt) => selectedValues.has(opt.value));
  const triggerShowsSkeleton = selectedValues.size > 0 && options.length === 0;

  // En modo lazy, la opacidad del popover solo aplica cuando ya hay datos previos.
  const isRefetching = isLazy ? isLazyFetching && !!lazyData : propIsFetching;

  /** Marca el filtro como abierto: dispara la carga lazy la primera vez. */
  const markOpened = () => {
    if (!hasOpened) setHasOpened(true);
  };

  const toggleValue = (value: string) => {
    if (selectedValues.has(value)) {
      selectedValues.delete(value);
    } else {
      selectedValues.add(value);
    }
    const filterValues = Array.from(selectedValues);
    column?.setFilterValue(filterValues.length ? filterValues : undefined);
  };

  const clear = () => column?.setFilterValue(undefined);

  return {
    columnId: column?.id,
    isLazy,
    isLazyFetching,
    isFetching,
    isRefetching,
    hasLazyData: !!lazyData,
    options,
    visibleOptions,
    facets,
    selectedValues,
    selectedLabels,
    triggerShowsSkeleton,
    markOpened,
    toggleValue,
    clear,
  };
}

export type FacetFilterState = ReturnType<typeof useFacetFilter>;
