'use client';

import { Popover, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';

import { FacetOptionsList } from './filters/FacetOptionsList';
import { FilterChip, FilterTriggerButton } from './filters/FilterChipShell';
import { useFacetFilter } from './filters/use-facet-filter';
import type { DataTableFacetedFilterProps } from './types';

/**
 * Filtro faceteado multi-select para columnas del DataTable.
 *
 * Soporta dos modos:
 * - **Modo bulk** (default): `options` y `externalCounts` vienen como props del padre.
 * - **Modo lazy** (cuando `fetchFacet` está presente): las opciones se cargan on-demand
 *   al abrir el popover por primera vez, con skeleton y cache de React Query.
 *
 * `variant`: `'trigger'` (default) es el botón del filtro inactivo; `'chip'` es el chip del
 * filtro activo (`Título: valor +n` con ✕). Un chip sin valores se ve como trigger.
 * La lógica vive en `filters/use-facet-filter` y el cuerpo en `filters/FacetOptionsList`.
 */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  externalCounts,
  disabled,
  isFetching,
  fetchFacet,
  facetParams,
  facetScope,
  variant = 'trigger',
}: DataTableFacetedFilterProps<TData, TValue>) {
  const state = useFacetFilter({ column, options, externalCounts, isFetching, fetchFacet, facetParams, facetScope });
  const { selectedValues, selectedLabels, triggerShowsSkeleton } = state;

  const testId = `filter-${column?.id}`;
  const showChip = variant === 'chip' && selectedValues.size > 0;

  const firstLabel = selectedLabels[0]?.label ?? '';

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) state.markOpened();
      }}
    >
      {showChip ? (
        <FilterChip
          title={title}
          value={firstLabel}
          valueTitle={selectedLabels.map((o) => o.label).join(', ')}
          extraCount={triggerShowsSkeleton ? undefined : Math.max(selectedValues.size - 1, 0)}
          loading={triggerShowsSkeleton}
          skeleton={<Skeleton className="h-4 w-16" />}
          onClear={state.clear}
          disabled={disabled}
          testId={testId}
          clearTestId={`filter-chip-clear-${column?.id}`}
        />
      ) : (
        <FilterTriggerButton title={title} disabled={disabled} testId={testId} />
      )}
      <PopoverContent className="w-64 p-0" align="start">
        <FacetOptionsList title={title} state={state} />
      </PopoverContent>
    </Popover>
  );
}
