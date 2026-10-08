'use client';

import { Popover, PopoverContent } from '@/components/ui/popover';

import { DateRangeFilterBody } from './filters/DateRangeFilterBody';
import { FilterChip, FilterTriggerButton } from './filters/FilterChipShell';
import { useUrlDateRange } from './filters/use-url-date-range';
import type { DataTableFilterVariant } from './types';

interface DataTableDateRangeFilterProps {
  columnId: string;
  title: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
  /** `'trigger'` (default): botón del filtro inactivo. `'chip'`: chip del filtro activo con ✕. */
  variant?: DataTableFilterVariant;
}

export function DataTableDateRangeFilter({
  columnId,
  title,
  paramNamespace,
  variant = 'trigger',
}: DataTableDateRangeFilterProps) {
  const state = useUrlDateRange({ columnId, paramNamespace });

  return (
    <Popover>
      {variant === 'chip' && state.hasValue ? (
        <FilterChip
          title={title}
          value={state.rangeLabel}
          valueTitle={state.rangeLabel}
          onClear={state.clearFilter}
          testId={`filter-${columnId}`}
          clearTestId={`filter-chip-clear-${columnId}`}
        />
      ) : (
        <FilterTriggerButton title={title} testId={`filter-${columnId}`} />
      )}
      <PopoverContent className="w-auto p-0" align="start">
        <DateRangeFilterBody state={state} />
      </PopoverContent>
    </Popover>
  );
}
