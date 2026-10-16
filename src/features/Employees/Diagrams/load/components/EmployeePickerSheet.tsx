'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { getLoadEmployeeFilterOptions, searchLoadEmployees, type EmployeeSearchInput } from '../actions.server';
import type { EmployeeOption } from '../schemas';

/** Filtros del selector: cada uno es una lista de ids del catálogo correspondiente. */
type PickerFilters = Pick<
  EmployeeSearchInput,
  'workflows' | 'positions' | 'costCenters' | 'covenants' | 'guilds' | 'categories' | 'contractors'
>;
type FilterKey = keyof PickerFilters;

export interface WorkflowFilterOption {
  value: string;
  label: string;
}

interface EmployeePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: EmployeeOption[];
  onApply: (employees: EmployeeOption[]) => void;
  /** Máximo de empleados que se pueden elegir. Con 1 se elige y se aplica en el mismo gesto. */
  max: number;
  /** Habilita los filtros por diagrama de trabajo, puesto, centro de costo, etc. (cargas masivas). */
  withFilters?: boolean;
  /** Diagramas de trabajo para el filtro; los trae la pantalla porque ya tiene el catálogo cargado. */
  workflowOptions?: WorkflowFilterOption[];
  /** Diagrama de trabajo con el que arranca filtrado el selector (el elegido en la carga). */
  defaultWorkflowId?: string;
}

/**
 * Selector de empleados en un panel lateral: búsqueda por legajo o nombre, filtros opcionales y selección
 * múltiple. El contenido se monta recién al abrir, así el estado local arranca con la selección vigente y el
 * catálogo de filtros y la primera página sólo se piden cuando el usuario lo abre.
 */
export function EmployeePickerSheet({ open, onOpenChange, ...bodyProps }: EmployeePickerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 sm:max-w-lg">
        <PickerBody onClose={() => onOpenChange(false)} {...bodyProps} />
      </SheetContent>
    </Sheet>
  );
}

type PickerBodyProps = Omit<EmployeePickerSheetProps, 'open' | 'onOpenChange'> & { onClose: () => void };

const FILTER_STALE_TIME = 5 * 60 * 1000;

function PickerBody({
  selected,
  onApply,
  max,
  withFilters = false,
  workflowOptions = [],
  defaultWorkflowId,
  onClose,
}: PickerBodyProps) {
  const [search, setSearch] = useState('');
  const [local, setLocal] = useState<Map<string, EmployeeOption>>(() => new Map(selected.map((e) => [e.id, e])));
  const [filters, setFilters] = useState<PickerFilters>(() =>
    defaultWorkflowId ? { workflows: [defaultWorkflowId] } : {}
  );
  const [filtersOpen, setFiltersOpen] = useState(Boolean(defaultWorkflowId));
  const debouncedSearch = useDebounce(search.trim(), 300);
  const isSingle = max === 1;

  const employeesQuery = useInfiniteQuery({
    queryKey: ['diagram-load-employees', debouncedSearch, filters],
    queryFn: ({ pageParam }) => searchLoadEmployees({ ...filters, search: debouncedSearch, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30 * 1000,
  });

  const filterOptionsQuery = useQuery({
    queryKey: ['diagram-load-filter-options'],
    queryFn: () => getLoadEmployeeFilterOptions(),
    enabled: withFilters && filtersOpen,
    staleTime: FILTER_STALE_TIME,
  });

  const loaded = employeesQuery.data?.pages.flatMap((page) => page.employees) ?? [];
  const activeFilterCount = Object.values(filters).filter((values) => values && values.length > 0).length;

  const setFilter = (key: FilterKey, values: string[]) => setFilters((prev) => ({ ...prev, [key]: values }));

  const toggle = (employee: EmployeeOption) => {
    if (isSingle) {
      onApply([employee]);
      onClose();
      return;
    }
    const next = new Map(local);
    if (next.has(employee.id)) {
      next.delete(employee.id);
    } else if (next.size >= max) {
      toast.warning(`Máximo ${max} empleados por carga`);
      return;
    } else {
      next.set(employee.id, employee);
    }
    setLocal(next);
  };

  const selectLoaded = () => {
    const next = new Map(local);
    let truncated = false;
    for (const employee of loaded) {
      if (next.has(employee.id)) continue;
      if (next.size >= max) {
        truncated = true;
        break;
      }
      next.set(employee.id, employee);
    }
    setLocal(next);
    if (truncated) toast.warning(`Solo se agregaron empleados hasta el máximo de ${max}.`);
  };

  const apply = () => {
    onApply([...local.values()]);
    onClose();
  };

  const filterOptions = filterOptionsQuery.data;
  const filterFields: { key: FilterKey; label: string; options: WorkflowFilterOption[]; loading: boolean }[] = [
    { key: 'workflows', label: 'Diagrama de trabajo', options: workflowOptions, loading: false },
    {
      key: 'positions',
      label: 'Puesto',
      options: filterOptions?.positions ?? [],
      loading: filterOptionsQuery.isFetching,
    },
    {
      key: 'costCenters',
      label: 'Centro de costo',
      options: filterOptions?.costCenters ?? [],
      loading: filterOptionsQuery.isFetching,
    },
    {
      key: 'covenants',
      label: 'Convenio',
      options: filterOptions?.covenants ?? [],
      loading: filterOptionsQuery.isFetching,
    },
    { key: 'guilds', label: 'Gremio', options: filterOptions?.guilds ?? [], loading: filterOptionsQuery.isFetching },
    {
      key: 'categories',
      label: 'Categoría',
      options: filterOptions?.categories ?? [],
      loading: filterOptionsQuery.isFetching,
    },
    {
      key: 'contractors',
      label: 'Contratista',
      options: filterOptions?.contractors ?? [],
      loading: filterOptionsQuery.isFetching,
    },
  ];

  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        <SheetTitle>{isSingle ? 'Elegir empleado' : 'Elegir empleados'}</SheetTitle>
        <SheetDescription>
          {isSingle ? 'Buscá por legajo o nombre.' : `Buscá por legajo o nombre y elegí hasta ${max} empleados.`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-3 border-b p-4">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por legajo o nombre"
            aria-label="Buscar por legajo o nombre"
            className="pl-9"
          />
        </div>

        {withFilters ? (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              <ChevronDown
                aria-hidden="true"
                className={filtersOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            {filtersOpen ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filterFields.map((field) => (
                  <div key={field.key} className="flex min-w-0 flex-col gap-1">
                    <Label className="text-xs">{field.label}</Label>
                    <MultiSelectCombobox
                      options={field.options}
                      placeholder={`Elegir ${field.label.toLowerCase()}`}
                      emptyMessage="Sin resultados"
                      selectedValues={filters[field.key] ?? []}
                      onChange={(values) => setFilter(field.key, values)}
                      isLoading={field.loading}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isSingle ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
              {local.size} {local.size === 1 ? 'seleccionado' : 'seleccionados'} de {max}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={selectLoaded} disabled={loaded.length === 0}>
                Elegir los {loaded.length} listados
              </Button>
              {local.size > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLocal(new Map())}>
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {employeesQuery.isPending ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : employeesQuery.isError ? (
          <StateBlock
            variant="error"
            title="No se pudieron cargar los empleados"
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => employeesQuery.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : loaded.length === 0 ? (
          <StateBlock
            variant="empty"
            title="No hay empleados para mostrar"
            description="Probá con otro legajo o nombre, o quitá algún filtro."
          />
        ) : (
          <ul className="flex flex-col">
            {loaded.map((employee) => {
              const checked = local.has(employee.id);
              const inputId = `picker-${employee.id}`;
              const rowClass =
                'hover:bg-accent/50 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm';
              return (
                <li key={employee.id}>
                  {isSingle ? (
                    <button
                      type="button"
                      onClick={() => toggle(employee)}
                      className={`${rowClass} focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]`}
                    >
                      <span className="min-w-0 flex-1 truncate">{employee.label}</span>
                    </button>
                  ) : (
                    <label htmlFor={inputId} className={rowClass}>
                      <Checkbox id={inputId} checked={checked} onCheckedChange={() => toggle(employee)} />
                      <span className="min-w-0 flex-1 truncate">{employee.label}</span>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {employeesQuery.hasNextPage ? (
          <div className="flex justify-center p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => employeesQuery.fetchNextPage()}
              disabled={employeesQuery.isFetchingNextPage}
            >
              {employeesQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end border-t p-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        {!isSingle ? (
          <Button type="button" onClick={apply}>
            Aplicar selección ({local.size})
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}
