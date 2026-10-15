'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { FormEvent } from 'react';
import { getDiagramFilterOptions } from '../actions/diagram-search-actions';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterState {
  firstname: string;
  lastname: string;
  position: string[];
  workflow: string[];
  costCenter: string[];
  covenant: string[];
  guild: string[];
  category: string[];
  contractors: string[];
}

export const EMPTY_FILTERS: FilterState = {
  firstname: '',
  lastname: '',
  position: [],
  workflow: [],
  costCenter: [],
  covenant: [],
  guild: [],
  category: [],
  contractors: [],
};

const FILTER_LABELS: Record<keyof FilterState, string> = {
  firstname: 'Nombre',
  lastname: 'Apellido',
  position: 'Posición',
  workflow: 'Diagrama de Trabajo',
  costCenter: 'Centro de Costo',
  covenant: 'Convenio',
  guild: 'Gremio',
  category: 'Categoría',
  contractors: 'Contratista',
};

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  filters: FilterState;
  activeFilters: (keyof FilterState)[];
  showFilters: boolean;
  isSearching: boolean;
  onFiltersChange: (filters: FilterState) => void;
  onActiveFiltersChange: (activeFilters: (keyof FilterState)[]) => void;
  onToggleFilters: () => void;
  onSubmit: () => void;
  onClearAll: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EmployeeFilterPanel({
  filters,
  activeFilters,
  showFilters,
  isSearching,
  onFiltersChange,
  onActiveFiltersChange,
  onToggleFilters,
  onSubmit,
  onClearAll,
}: Props) {
  // ── Catalog queries — lazy, only fetch when filters panel is open ──────────

  const { data: positions = [], isFetching: isFetchingPositions } = useQuery({
    queryKey: ['diagram-filter-options', 'positions'],
    queryFn: () => getDiagramFilterOptions('positions'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  const { data: costCenters = [], isFetching: isFetchingCostCenters } = useQuery({
    queryKey: ['diagram-filter-options', 'costCenters'],
    queryFn: () => getDiagramFilterOptions('costCenters'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  const { data: covenants = [], isFetching: isFetchingCovenants } = useQuery({
    queryKey: ['diagram-filter-options', 'covenants'],
    queryFn: () => getDiagramFilterOptions('covenants'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  const { data: guilds = [], isFetching: isFetchingGuilds } = useQuery({
    queryKey: ['diagram-filter-options', 'guilds'],
    queryFn: () => getDiagramFilterOptions('guilds'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rawCategories = [], isFetching: isFetchingCategories } = useQuery({
    queryKey: ['diagram-filter-options', 'categories'],
    queryFn: () => getDiagramFilterOptions('categories'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  const { data: contractors = [], isFetching: isFetchingContractors } = useQuery({
    queryKey: ['diagram-filter-options', 'contractors'],
    queryFn: () => getDiagramFilterOptions('contractors'),
    enabled: showFilters,
    staleTime: 5 * 60 * 1000,
  });

  // Categories include a covenant relation — cast to access it
  const categories = rawCategories as {
    id: string;
    name: string | null;
    covenant?: { name: string | null } | null;
  }[];

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toOptions(items: { id: string; name: string | null }[]) {
    return items.map((item) => ({ value: item.id, label: item.name ?? item.id }));
  }

  function updateTextFilter(field: 'firstname' | 'lastname', value: string) {
    const updated = { ...filters, [field]: value };
    onFiltersChange(updated);

    const hasValue = value.trim().length > 0;
    const isActive = activeFilters.includes(field);

    if (hasValue && !isActive) {
      onActiveFiltersChange([...activeFilters, field]);
    } else if (!hasValue && isActive) {
      onActiveFiltersChange(activeFilters.filter((f) => f !== field));
    }
  }

  function updateMultiFilter(field: keyof FilterState, values: string[]) {
    const updated = { ...filters, [field]: values };
    onFiltersChange(updated);

    const hasValues = values.length > 0;
    const isActive = activeFilters.includes(field);

    if (hasValues && !isActive) {
      onActiveFiltersChange([...activeFilters, field]);
    } else if (!hasValues && isActive) {
      onActiveFiltersChange(activeFilters.filter((f) => f !== field));
    }
  }

  function clearSingleFilter(field: keyof FilterState) {
    const isText = field === 'firstname' || field === 'lastname';
    const updated = { ...filters, [field]: isText ? '' : [] };
    onFiltersChange(updated);
    onActiveFiltersChange(activeFilters.filter((f) => f !== field));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Filtrar empleados</CardTitle>
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-7 px-2 text-xs">
                <X className="mr-1 h-3 w-3" />
                Limpiar todo
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onToggleFilters} className="h-7 px-2 text-xs">
              <Search className="mr-1 h-3 w-3" />
              {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
            </Button>
          </div>
        </div>

        {/* Active filter badges */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {activeFilters.map((field) => (
              <Badge key={field} variant="secondary" className="flex items-center gap-1 text-xs">
                {FILTER_LABELS[field]}
                {/* workflow is auto-set by the parent — not manually clearable */}
                {field !== 'workflow' && (
                  <button
                    type="button"
                    onClick={() => clearSingleFilter(field)}
                    className="ml-1 rounded-full hover:bg-muted"
                    aria-label={`Quitar filtro ${FILTER_LABELS[field]}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      {/* Collapsible filter inputs */}
      {showFilters && (
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Nombre */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="filter-firstname">Nombre</Label>
                <Input
                  id="filter-firstname"
                  placeholder="Buscar por nombre..."
                  value={filters.firstname}
                  onChange={(e) => updateTextFilter('firstname', e.target.value)}
                />
              </div>

              {/* Apellido */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="filter-lastname">Apellido</Label>
                <Input
                  id="filter-lastname"
                  placeholder="Buscar por apellido..."
                  value={filters.lastname}
                  onChange={(e) => updateTextFilter('lastname', e.target.value)}
                />
              </div>

              {/* Posición */}
              <div className="flex flex-col gap-1">
                <Label>Posición</Label>
                <MultiSelectCombobox
                  options={toOptions(positions as { id: string; name: string | null }[])}
                  placeholder="Seleccionar posición..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.position}
                  onChange={(values) => updateMultiFilter('position', values)}
                  isLoading={isFetchingPositions}
                />
              </div>

              {/* Centro de Costo */}
              <div className="flex flex-col gap-1">
                <Label>Centro de Costo</Label>
                <MultiSelectCombobox
                  options={toOptions(costCenters as { id: string; name: string | null }[])}
                  placeholder="Seleccionar centro de costo..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.costCenter}
                  onChange={(values) => updateMultiFilter('costCenter', values)}
                  isLoading={isFetchingCostCenters}
                />
              </div>

              {/* Convenio */}
              <div className="flex flex-col gap-1">
                <Label>Convenio</Label>
                <MultiSelectCombobox
                  options={toOptions(covenants as { id: string; name: string | null }[])}
                  placeholder="Seleccionar convenio..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.covenant}
                  onChange={(values) => updateMultiFilter('covenant', values)}
                  isLoading={isFetchingCovenants}
                />
              </div>

              {/* Gremio */}
              <div className="flex flex-col gap-1">
                <Label>Gremio</Label>
                <MultiSelectCombobox
                  options={toOptions(guilds as { id: string; name: string | null }[])}
                  placeholder="Seleccionar gremio..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.guild}
                  onChange={(values) => updateMultiFilter('guild', values)}
                  isLoading={isFetchingGuilds}
                />
              </div>

              {/* Categoría — label shows "Name (CovenantName)" */}
              <div className="flex flex-col gap-1">
                <Label>Categoría</Label>
                <MultiSelectCombobox
                  options={categories.map((cat) => ({
                    value: cat.id,
                    label: cat.covenant?.name ? `${cat.name ?? cat.id} (${cat.covenant.name})` : cat.name ?? cat.id,
                  }))}
                  placeholder="Seleccionar categoría..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.category}
                  onChange={(values) => updateMultiFilter('category', values)}
                  isLoading={isFetchingCategories}
                />
              </div>

              {/* Contratista */}
              <div className="flex flex-col gap-1">
                <Label>Contratista</Label>
                <MultiSelectCombobox
                  options={toOptions(contractors as { id: string; name: string | null }[])}
                  placeholder="Seleccionar contratista..."
                  emptyMessage="Sin resultados"
                  selectedValues={filters.contractors}
                  onChange={(values) => updateMultiFilter('contractors', values)}
                  isLoading={isFetchingContractors}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={isSearching} size="sm">
                <Search className="mr-2 h-4 w-4" />
                {isSearching ? 'Buscando...' : 'Buscar empleados'}
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
