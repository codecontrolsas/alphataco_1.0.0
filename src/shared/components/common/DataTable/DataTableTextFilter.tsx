'use client';

import { Popover, PopoverContent } from '@/components/ui/popover';

import { FilterChip, FilterTriggerButton } from './filters/FilterChipShell';
import { TextFilterBody } from './filters/TextFilterBody';
import { useUrlTextFilter } from './filters/use-url-text-filter';
import type { DataTableFilterVariant } from './types';

interface DataTableTextFilterProps {
  columnId: string;
  title: string;
  placeholder?: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
  /** `'trigger'` (default): botón del filtro inactivo. `'chip'`: chip del filtro activo con ✕. */
  variant?: DataTableFilterVariant;
}

export function DataTableTextFilter({
  columnId,
  title,
  placeholder,
  paramNamespace,
  variant = 'trigger',
}: DataTableTextFilterProps) {
  const state = useUrlTextFilter({ columnId, paramNamespace });

  return (
    <Popover>
      {variant === 'chip' && state.hasValue ? (
        <FilterChip
          title={title}
          value={state.currentValue}
          valueTitle={state.currentValue}
          onClear={state.clearFilter}
          testId={`filter-${columnId}`}
          clearTestId={`filter-chip-clear-${columnId}`}
        />
      ) : (
        <FilterTriggerButton title={title} testId={`filter-${columnId}`} />
      )}
      <PopoverContent className="w-64 p-3" align="start">
        <TextFilterBody title={title} placeholder={placeholder} state={state} />
      </PopoverContent>
    </Popover>
  );
}
