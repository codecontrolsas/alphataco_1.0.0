'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useMemo } from 'react';
import type { DiagramFilterCatalog } from '../../actions/diagram-search-actions';
import { NONE_VALUE, type ArrayFilterKey, type DiagramCalendarFilters } from '../utils/calendar-filters';
import { FILTER_LABELS } from './ActiveFilterChips';

interface FieldConfig {
  key: ArrayFilterKey;
  placeholder: string;
  emptyMessage: string;
}

const FIELDS: FieldConfig[] = [
  { key: 'position', placeholder: 'Todos los puestos', emptyMessage: 'No hay puestos' },
  { key: 'workflow', placeholder: 'Todos los diagramas', emptyMessage: 'No hay diagramas de trabajo' },
  { key: 'costCenter', placeholder: 'Todos los centros de costos', emptyMessage: 'No hay centros de costos' },
  { key: 'covenant', placeholder: 'Todos los convenios', emptyMessage: 'No hay convenios' },
  { key: 'guild', placeholder: 'Todos los gremios', emptyMessage: 'No hay gremios' },
  { key: 'category', placeholder: 'Todas las categorías', emptyMessage: 'No hay categorías' },
  { key: 'contractor', placeholder: 'Todos los contratistas', emptyMessage: 'No hay contratistas' },
  { key: 'diagramType', placeholder: 'Todas las novedades', emptyMessage: 'No hay tipos de novedad' },
];

type SelectOption = { label: string; value: string };

function buildOptions(catalog: DiagramFilterCatalog): Record<ArrayFilterKey, SelectOption[]> {
  const named = (items: { id: string; name: string | null }[]): SelectOption[] =>
    items.map((item) => ({ label: item.name || 'Sin nombre', value: item.id }));

  return {
    position: named(catalog.positions),
    workflow: named(catalog.workflows),
    costCenter: named(catalog.costCenters),
    covenant: named(catalog.covenants),
    guild: named(catalog.guilds),
    category: catalog.categories.map((category) => ({
      label: category.name
        ? `${category.name}${category.covenant?.name ? ` - ${category.covenant.name}` : ''}`
        : 'Sin nombre',
      value: category.id,
    })),
    contractor: named(catalog.contractors),
    diagramType: [{ label: 'Sin novedad hoy', value: NONE_VALUE }, ...named(catalog.diagramTypes)],
  };
}

interface CalendarFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: DiagramCalendarFilters;
  catalog: DiagramFilterCatalog | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onChange: (key: ArrayFilterKey, values: string[]) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

/** Panel lateral con los 8 filtros de lista. Cada cambio aplica al instante (no hay botón "Buscar"). */
export function CalendarFiltersSheet({
  open,
  onOpenChange,
  filters,
  catalog,
  isLoading,
  isError,
  onRetry,
  onChange,
  onClear,
  hasActiveFilters,
}: CalendarFiltersSheetProps) {
  const options = useMemo(() => (catalog ? buildOptions(catalog) : null), [catalog]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filtros del calendario</SheetTitle>
          <SheetDescription>Los cambios se aplican a medida que elegís.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
          {isError && !options ? (
            <StateBlock
              variant="error"
              title="No se pudieron cargar los filtros"
              action={
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Reintentar
                </Button>
              }
            />
          ) : (
            FIELDS.map(({ key, placeholder, emptyMessage }) => (
              <div key={key} className="space-y-1.5">
                <Label>{key === 'diagramType' ? 'Novedad de hoy' : FILTER_LABELS[key]}</Label>
                {isLoading || !options ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <MultiSelectCombobox
                    options={options[key]}
                    placeholder={placeholder}
                    emptyMessage={emptyMessage}
                    selectedValues={filters[key]}
                    onChange={(values) => onChange(key, values.filter(Boolean))}
                  />
                )}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="flex-row justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onClear} disabled={!hasActiveFilters}>
            Limpiar filtros
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
