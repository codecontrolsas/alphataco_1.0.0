'use client';

import type { Column, Table } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { useActiveFilterIds } from './DataTableToolbar';
import { DateRangeFilterBody } from './filters/DateRangeFilterBody';
import { FacetOptionsList } from './filters/FacetOptionsList';
import { TextFilterBody } from './filters/TextFilterBody';
import { useFacetFilter } from './filters/use-facet-filter';
import { useUrlDateRange } from './filters/use-url-date-range';
import { useUrlTextFilter } from './filters/use-url-text-filter';
import { getColumnLabel } from './mobile-columns';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from './types';

/** Qué sección abre el sheet: "Filtros (n)" va a los filtros, "Ordenar" al orden. */
export type DataTableMobilePanel = 'filters' | 'sort';

const STRUCTURAL_COLUMN_IDS = new Set(['select', 'actions']);

function getSortableColumns<TData>(table: Table<TData>): Column<TData, unknown>[] {
  return table.getVisibleLeafColumns().filter((column) => !STRUCTURAL_COLUMN_IDS.has(column.id) && column.getCanSort());
}

// ---------------------------------------------------------------------------
// Disparadores (van en la fila 2 de la toolbar mobile)
// ---------------------------------------------------------------------------

interface FiltersTriggerProps {
  filters: DataTableFacetedFilterConfig[];
  paramNamespace?: string;
  onOpen: () => void;
}

/** Botón "Filtros (n)": `n` cuenta los filtros con valor en la URL (incluye fechas y columnas ocultas). */
export function DataTableMobileFiltersTrigger({ filters, paramNamespace, onOpen }: FiltersTriggerProps) {
  const activeCount = useActiveFilterIds(filters, paramNamespace).size;

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-11"
      aria-haspopup="dialog"
      onClick={onOpen}
      data-testid="table-mobile-filters-trigger"
    >
      <SlidersHorizontal aria-hidden="true" />
      Filtros
      {activeCount > 0 ? <span className="tabular-nums">({activeCount})</span> : null}
    </Button>
  );
}

interface SortTriggerProps<TData> {
  table: Table<TData>;
  onOpen: () => void;
}

/** Botón "Ordenar: <columna> ↑" ("Ordenar" si no hay orden). No se muestra si ninguna columna visible ordena. */
export function DataTableMobileSortTrigger<TData>({ table, onOpen }: SortTriggerProps<TData>) {
  if (getSortableColumns(table).length === 0) return null;

  const first = table.getState().sorting[0];
  const firstColumn = first ? table.getColumn(first.id) : undefined;
  const label = first ? `${firstColumn ? getColumnLabel(firstColumn) : first.id} ${first.desc ? '↓' : '↑'}` : null;

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-11 min-w-0"
      aria-haspopup="dialog"
      onClick={onOpen}
      data-testid="table-mobile-sort-trigger"
    >
      <span className="truncate">{label ? `Ordenar: ${label}` : 'Ordenar'}</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Sección 1: Ordenar por
// ---------------------------------------------------------------------------

function SortSection<TData>({ table }: { table: Table<TData> }) {
  const fieldId = React.useId();
  const sorting = table.getState().sorting;
  const columns = getSortableColumns(table);
  const current = sorting[0];
  const isMultiSort = sorting.length > 1;

  const labelOf = (id: string) => {
    const column = table.getColumn(id);
    return column ? getColumnLabel(column) : id;
  };

  return (
    <section aria-labelledby={`${fieldId}-sort`} className="flex flex-col gap-3">
      <h3 id={`${fieldId}-sort`} className="text-label font-semibold">
        Ordenar por
      </h3>

      {isMultiSort ? (
        <div className="bg-muted flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <p className="text-cell min-w-0 flex-1">
            {sorting.map((sort, index) => `${index + 1}. ${labelOf(sort.id)} ${sort.desc ? '↓' : '↑'}`).join(' · ')}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => table.resetSorting()}>
            Quitar orden
          </Button>
        </div>
      ) : null}

      <RadioGroup
        value={isMultiSort ? '' : (current?.id ?? '')}
        onValueChange={(id) => table.setSorting([{ id, desc: current?.desc ?? false }])}
        className="gap-0"
        aria-label="Columna de orden"
      >
        {columns.map((column) => (
          <label
            key={column.id}
            htmlFor={`${fieldId}-${column.id}`}
            className="text-cell flex min-h-11 cursor-pointer items-center gap-3"
          >
            <RadioGroupItem value={column.id} id={`${fieldId}-${column.id}`} />
            <span className="min-w-0 flex-1 break-words">{getColumnLabel(column)}</span>
          </label>
        ))}
      </RadioGroup>

      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Dirección del orden"
        value={current ? (current.desc ? 'desc' : 'asc') : ''}
        onValueChange={(value) => {
          if (!value || !current) return;
          table.setSorting([{ id: current.id, desc: value === 'desc' }]);
        }}
        className="w-full"
      >
        <ToggleGroupItem value="asc" disabled={!current} className="h-11 flex-1">
          <ArrowUp aria-hidden="true" />
          Ascendente
        </ToggleGroupItem>
        <ToggleGroupItem value="desc" disabled={!current} className="h-11 flex-1">
          <ArrowDown aria-hidden="true" />
          Descendente
        </ToggleGroupItem>
      </ToggleGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sección 2: Filtros (un ítem del acordeón por filtro, mismos cuerpos que el popover desktop)
// ---------------------------------------------------------------------------

interface FilterItemShellProps {
  value: string;
  title: string;
  /** Resumen del valor activo, a la derecha del título. */
  summary?: string;
  onTriggerClick?: () => void;
  children: React.ReactNode;
}

function FilterItemShell({ value, title, summary, onTriggerClick, children }: FilterItemShellProps) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="min-h-11 items-center py-2" onClick={onTriggerClick}>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0">{title}</span>
          {summary ? <span className="text-caption text-muted-foreground truncate font-normal">{summary}</span> : null}
        </span>
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}

interface FilterItemProps<TData> {
  table: Table<TData>;
  filter: DataTableFacetedFilterConfig;
  paramNamespace?: string;
  facetParams?: DataTableSearchParams;
  facetScope?: readonly unknown[];
  isFetchingFacets?: boolean;
}

const FACET_LIST_CLASS = '[&_[cmdk-item]]:min-h-11 [&_[data-slot=command-input-wrapper]]:h-11 [&_[data-slot=command-input]]:h-11';

function FacetedItem<TData>({ table, filter, facetParams, facetScope, isFetchingFacets }: FilterItemProps<TData>) {
  const column = table.getColumn(filter.columnId);
  // Misma queryKey que el popover desktop: abrir uno u otro comparte la caché (una sola carga por faceta).
  const state = useFacetFilter({
    column,
    options: filter.options ?? [],
    externalCounts: filter.externalCounts,
    isFetching: isFetchingFacets,
    fetchFacet: filter.fetchFacet,
    facetParams,
    facetScope,
  });

  if (!column) return null;

  const summary = state.triggerShowsSkeleton
    ? ''
    : state.selectedLabels.map((option) => option.label).join(', ');

  return (
    <FilterItemShell value={filter.columnId} title={filter.title} summary={summary} onTriggerClick={state.markOpened}>
      <FacetOptionsList title={filter.title} state={state} className={FACET_LIST_CLASS} />
    </FilterItemShell>
  );
}

function TextItem<TData>({ filter, paramNamespace }: FilterItemProps<TData>) {
  const state = useUrlTextFilter({ columnId: filter.columnId, paramNamespace });

  return (
    <FilterItemShell value={filter.columnId} title={filter.title} summary={state.currentValue}>
      <TextFilterBody
        title={filter.title}
        placeholder={filter.placeholder}
        state={state}
        autoFocus={false}
        inputClassName="h-11 text-base"
      />
    </FilterItemShell>
  );
}

function DateItem<TData>({ filter, paramNamespace }: FilterItemProps<TData>) {
  const state = useUrlDateRange({ columnId: filter.columnId, paramNamespace });

  return (
    <FilterItemShell value={filter.columnId} title={filter.title} summary={state.rangeLabel}>
      <div className="flex justify-center">
        <DateRangeFilterBody state={state} autoFocus={false} />
      </div>
    </FilterItemShell>
  );
}

function FilterItem<TData>(props: FilterItemProps<TData>) {
  if (props.filter.type === 'dateRange') return <DateItem {...props} />;
  if (props.filter.type === 'text') return <TextItem {...props} />;
  return <FacetedItem {...props} />;
}

// ---------------------------------------------------------------------------
// Cuerpo y diálogo
// ---------------------------------------------------------------------------

interface BodyProps<TData> {
  table: Table<TData>;
  filters: DataTableFacetedFilterConfig[];
  panel: DataTableMobilePanel;
  paramNamespace?: string;
  facetParams?: DataTableSearchParams;
  facetScope?: readonly unknown[];
  isFetchingFacets?: boolean;
}

function MobileFiltersBody<TData>({ table, filters, panel, ...itemProps }: BodyProps<TData>) {
  const activeIds = useActiveFilterIds(filters, itemProps.paramNamespace);

  // Se calcula una sola vez al abrir: los filtros con valor van primero y abiertos. Si se reordenara
  // mientras el usuario aplica un filtro, los ítems saltarían bajo su dedo.
  const [initial] = React.useState(() => ({
    ordered: [...filters].sort((a, b) => Number(activeIds.has(b.columnId)) - Number(activeIds.has(a.columnId))),
    openIds: filters.filter((f) => activeIds.has(f.columnId)).map((f) => f.columnId),
  }));

  // "Filtros (n)" abre el sheet ya bajado a la sección de filtros (ref callback: sin useEffect).
  const scrollToFilters = React.useCallback(
    (node: HTMLElement | null) => {
      if (node && panel === 'filters') node.scrollIntoView({ block: 'start' });
    },
    [panel]
  );

  return (
    <div data-testid="table-mobile-filters" className="flex flex-col gap-6">
      <SortSection table={table} />

      {filters.length > 0 ? (
        <section ref={scrollToFilters} aria-label="Filtros" className="flex flex-col">
          <h3 className="text-label mb-1 font-semibold">Filtros</h3>
          <Accordion type="multiple" defaultValue={initial.openIds}>
            {initial.ordered.map((filter) => (
              <FilterItem key={filter.columnId} table={table} filter={filter} {...itemProps} />
            ))}
          </Accordion>
        </section>
      ) : null}
    </div>
  );
}

export interface DataTableMobileFiltersProps<TData> {
  table: Table<TData>;
  filters: DataTableFacetedFilterConfig[];
  /** `null` = cerrado. */
  panel: DataTableMobilePanel | null;
  onPanelChange: (panel: DataTableMobilePanel | null) => void;
  paramNamespace?: string;
  facetParams?: DataTableSearchParams;
  facetScope?: readonly unknown[];
  isFetchingFacets?: boolean;
  /** Total que ya está en memoria ("Ver N resultados"): no hay consulta de previsualización. */
  totalRows: number;
  /** Hay un refetch en curso: el botón dice "Ver resultados" sin número. */
  isRefetching?: boolean;
  hasActiveFilters?: boolean;
  onResetFilters: () => void;
}

/**
 * Sheet mobile de orden y filtros (bottom sheet). Aplicación inmediata: cada cambio escribe la URL al
 * instante, igual que en desktop, y la lista de fondo se actualiza. Incluye todos los filtros configurados,
 * también los que el usuario ocultó en desktop.
 */
export function DataTableMobileFilters<TData>({
  table,
  filters,
  panel,
  onPanelChange,
  totalRows,
  isRefetching = false,
  hasActiveFilters = false,
  onResetFilters,
  ...bodyProps
}: DataTableMobileFiltersProps<TData>) {
  const resultsLabel = isRefetching
    ? 'Ver resultados'
    : `Ver ${totalRows} ${totalRows === 1 ? 'resultado' : 'resultados'}`;

  return (
    <ResponsiveDialog
      open={panel !== null}
      onOpenChange={(open) => {
        if (!open) onPanelChange(null);
      }}
      title={filters.length > 0 ? 'Filtros' : 'Ordenar por'}
      layout="dialog"
      size="sm"
      footer={
        <>
          {filters.length > 0 ? (
            <Button type="button" variant="secondary" disabled={!hasActiveFilters} onClick={onResetFilters}>
              Limpiar
            </Button>
          ) : null}
          <Button type="button" aria-busy={isRefetching || undefined} onClick={() => onPanelChange(null)}>
            <span className="tabular-nums">{resultsLabel}</span>
          </Button>
        </>
      }
    >
      {/* El contenido del overlay solo se monta mientras está abierto: el cuerpo toma su estado inicial al abrir. */}
      <MobileFiltersBody table={table} filters={filters} panel={panel ?? 'filters'} {...bodyProps} />
    </ResponsiveDialog>
  );
}
