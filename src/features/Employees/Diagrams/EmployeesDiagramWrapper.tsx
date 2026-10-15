'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Logger } from '@/lib/logger';
import InfoComponent from '@/shared/components/common/InfoComponent';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import moment from 'moment';
import { FormEvent, useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import DiagramEmployeeView from './DiagramEmployeeView';
import {
  getDiagramFilterOptions,
  searchEmployeeDiagrams,
  type CategoryFilterOption,
} from './actions/diagram-search-actions';
import { DEFAULT_FILTERS, useDiagramUrlFilters, type DiagramFilterState } from './hooks/useDiagramUrlFilters';

const argentinaToday = () => moment(argentinaDate(), 'YYYY-MM-DD');

const logger = new Logger('Diagrams/EmployeesDiagramWrapper');

const PAGE_SIZE = 100;
/** La vista mensual se mantiene al día por polling (antes: suscripción realtime de Supabase). */
const REFETCH_INTERVAL_MS = 60_000;

export default function EmployeesDiagramWrapper({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { initialFilters, hasUrlFilters, syncToUrl, clearUrl } = useDiagramUrlFilters(searchParams);

  const [filters, setFilters] = useState<DiagramFilterState>(initialFilters);
  // Con filtros en la URL la búsqueda arranca sola al montar.
  const [hasSearched, setHasSearched] = useState<boolean>(hasUrlFilters);
  // Rango de días que muestra la grilla: el servidor trae las novedades solo de esa ventana (máx. 366 días).
  const [viewRange, setViewRange] = useState<DateRange | undefined>({
    from: argentinaToday().toDate(),
    to: argentinaToday().add(30, 'days').toDate(),
  });
  const viewDateFrom = viewRange?.from ? moment(viewRange.from).format('YYYY-MM-DD') : undefined;
  const viewDateTo = viewRange?.from ? moment(viewRange.to ?? viewRange.from).format('YYYY-MM-DD') : undefined;

  // The committed filters sent to the server (only updated on submit)
  const [committedFilters, setCommittedFilters] = useState<DiagramFilterState | null>(
    hasUrlFilters ? initialFilters : null
  );

  // ── Search query ──────────────────────────────────────────────────────────
  // Paginación acumulativa ("cargar más") con useInfiniteQuery: cada página es un pageParam y el
  // refetch periódico vuelve a traer TODAS las páginas cargadas, así la grilla refleja los cambios
  // de otros usuarios sin realtime.
  const {
    data: searchResult,
    isLoading: isSearching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['diagram-search', committedFilters, viewDateFrom, viewDateTo],
    queryFn: async ({ pageParam }) => {
      if (!committedFilters) return { data: [], hasMore: false };
      logger.debug('Fetching diagram search results', { data: { page: pageParam } });
      return searchEmployeeDiagrams({
        firstname: committedFilters.firstname,
        lastname: committedFilters.lastname,
        positions: committedFilters.position,
        workflows: committedFilters.workflow,
        costCenters: committedFilters.costCenter,
        covenants: committedFilters.covenant,
        guilds: committedFilters.guild,
        categories: committedFilters.category,
        contractors: committedFilters.contractor,
        diagramTypes: committedFilters.diagramType,
        page: pageParam,
        pageSize: PAGE_SIZE,
        dateFrom: viewDateFrom,
        dateTo: viewDateTo,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length + 1 : undefined),
    enabled: !!committedFilters,
    staleTime: 0,
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const accumulatedEmployees = useMemo(() => searchResult?.pages.flatMap((page) => page.data) ?? [], [searchResult]);

  const isLoadingFirstPage = isSearching;
  const isLoadingMore = isFetchingNextPage;
  const hasMoreData = hasNextPage ?? false;

  // ── Filter option queries (each catalog loads independently) ──────────────
  // Using staleTime: 5min so repeated popover opens don't refetch
  const { data: positions } = useQuery({
    queryKey: ['diagram-filter', 'positions'],
    queryFn: () => getDiagramFilterOptions('positions'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workflows } = useQuery({
    queryKey: ['diagram-filter', 'workflows'],
    queryFn: () => getDiagramFilterOptions('workflows'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: costCenters } = useQuery({
    queryKey: ['diagram-filter', 'costCenters'],
    queryFn: () => getDiagramFilterOptions('costCenters'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: covenants } = useQuery({
    queryKey: ['diagram-filter', 'covenants'],
    queryFn: () => getDiagramFilterOptions('covenants'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: guilds } = useQuery({
    queryKey: ['diagram-filter', 'guilds'],
    queryFn: () => getDiagramFilterOptions('guilds'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories } = useQuery({
    queryKey: ['diagram-filter', 'categories'],
    queryFn: () => getDiagramFilterOptions('categories'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: contractors } = useQuery({
    queryKey: ['diagram-filter', 'contractors'],
    queryFn: () => getDiagramFilterOptions('contractors'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: diagramTypes } = useQuery({
    queryKey: ['diagram-filter', 'diagramTypes'],
    queryFn: () => getDiagramFilterOptions('diagramTypes'),
    staleTime: 5 * 60 * 1000,
  });

  // ── Filter handlers ───────────────────────────────────────────────────────
  const handleFilterChange = (name: 'firstname' | 'lastname', value: string) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleMultiFilterChange = (
    name: Exclude<keyof DiagramFilterState, 'firstname' | 'lastname'>,
    values: string[]
  ) => {
    setFilters((prev) => ({ ...prev, [name]: values }));
  };

  const clearFilter = (name: keyof DiagramFilterState) => {
    if (name === 'firstname' || name === 'lastname') {
      setFilters((prev) => ({ ...prev, [name]: '' }));
    } else {
      setFilters((prev) => ({ ...prev, [name]: [] }));
    }
  };

  // ── Form submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    logger.debug('Submitting diagram search', { data: { filters } });
    setHasSearched(true);
    setCommittedFilters({ ...filters });
    syncToUrl(filters);
  };

  // ── Clear all filters ─────────────────────────────────────────────────────
  const handleClearAll = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setHasSearched(false);
    setCommittedFilters(null);
    clearUrl();
  };

  // ── Load more ─────────────────────────────────────────────────────────────
  const handleLoadMore = () => {
    if (isLoadingMore || !hasMoreData) return;
    void fetchNextPage();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Buscador de diagramas de empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Filtro por nombre y apellido */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="firstname">Nombre</Label>
                  <div className="relative">
                    <Input
                      id="firstname"
                      placeholder="Buscar por nombre"
                      value={filters.firstname}
                      onChange={(e) => handleFilterChange('firstname', e.target.value)}
                      className="pl-10 pr-10"
                    />
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    {filters.firstname && (
                      <button
                        type="button"
                        onClick={() => clearFilter('firstname')}
                        className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-black text-red-500"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="lastname">Apellido</Label>
                  <div className="relative">
                    <Input
                      id="lastname"
                      placeholder="Buscar por apellido"
                      value={filters.lastname}
                      onChange={(e) => handleFilterChange('lastname', e.target.value)}
                      className="pl-10 pr-10"
                    />
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    {filters.lastname && (
                      <button
                        type="button"
                        onClick={() => clearFilter('lastname')}
                        className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-black text-red-500"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Filtro por puesto en la empresa */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Puesto en la empresa</Label>
                  {filters.position.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('position')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(positions ?? []).map((p) => ({
                    label: p.name || 'Sin nombre',
                    value: p.id,
                  }))}
                  placeholder="Seleccionar puestos"
                  emptyMessage="No hay puestos"
                  selectedValues={filters.position}
                  onChange={(values) => handleMultiFilterChange('position', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por diagrama de trabajo */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Diagrama de trabajo</Label>
                  {filters.workflow.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('workflow')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(workflows ?? []).map((w) => ({
                    label: w.name || 'Sin nombre',
                    value: w.id,
                  }))}
                  placeholder="Seleccionar diagramas"
                  emptyMessage="No hay diagramas"
                  selectedValues={filters.workflow}
                  onChange={(values) => handleMultiFilterChange('workflow', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por centro de costos */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Centro de costos</Label>
                  {filters.costCenter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('costCenter')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(costCenters ?? []).map((cc) => ({
                    label: cc.name || 'Sin nombre',
                    value: cc.id,
                  }))}
                  placeholder="Seleccionar centros de costos"
                  emptyMessage="No hay centros de costos"
                  selectedValues={filters.costCenter}
                  onChange={(values) => handleMultiFilterChange('costCenter', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por convenio */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Convenio</Label>
                  {filters.covenant.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('covenant')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(covenants ?? []).map((c) => ({
                    label: c.name || 'Sin nombre',
                    value: c.id,
                  }))}
                  placeholder="Seleccionar convenios"
                  emptyMessage="No hay convenios"
                  selectedValues={filters.covenant}
                  onChange={(values) => handleMultiFilterChange('covenant', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por gremio */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Gremio</Label>
                  {filters.guild.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('guild')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(guilds ?? []).map((g) => ({
                    label: g.name || 'Sin nombre',
                    value: g.id,
                  }))}
                  placeholder="Seleccionar gremios"
                  emptyMessage="No hay gremios"
                  selectedValues={filters.guild}
                  onChange={(values) => handleMultiFilterChange('guild', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por categoría */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Categoría</Label>
                  {filters.category.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('category')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={((categories as CategoryFilterOption[] | undefined) ?? []).map((cat) => ({
                    label: cat.name
                      ? `${cat.name}${cat.covenant?.name ? ' - ' + cat.covenant.name : ''}`
                      : 'Sin nombre',
                    value: cat.id,
                  }))}
                  placeholder="Seleccionar categorías"
                  emptyMessage="No hay categorías"
                  selectedValues={filters.category}
                  onChange={(values) => handleMultiFilterChange('category', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por contratista */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Contratista</Label>
                  {filters.contractor.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('contractor')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={(contractors ?? []).map((c) => ({ label: c.name || 'Sin nombre', value: c.id }))}
                  placeholder="Seleccionar contratistas"
                  emptyMessage="No hay contratistas"
                  selectedValues={filters.contractor}
                  onChange={(values) => handleMultiFilterChange('contractor', values)}
                  showSelectAll
                />
              </div>

              {/* Filtro por tipos de diagrama */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Tipo de Diagrama</Label>
                  {filters.diagramType.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearFilter('diagramType')}
                      className="text-muted-foreground hover:text-black text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <MultiSelectCombobox
                  options={[
                    { label: 'Sin diagramas asignados', value: '__none__' },
                    ...(diagramTypes ?? []).map((t) => ({
                      label: t.name || 'Sin nombre',
                      value: t.id,
                    })),
                  ]}
                  placeholder="Seleccionar tipos de diagrama"
                  emptyMessage="No hay tipos de diagrama"
                  selectedValues={filters.diagramType}
                  onChange={(values) => handleMultiFilterChange('diagramType', values)}
                  showSelectAll
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              {hasSearched && (
                <Button type="button" variant="outline" onClick={handleClearAll}>
                  Limpiar filtros
                </Button>
              )}
              <Button type="submit" disabled={isSearching}>
                {isSearching ? 'Buscando...' : 'Buscar diagramas'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoadingFirstPage ? (
        <div className="flex justify-center items-center p-10">
          <p className="text-lg">Buscando diagramas de empleados...</p>
        </div>
      ) : accumulatedEmployees.length > 0 ? (
        <>
          {hasMoreData && (
            <div className="flex justify-center mb-2">
              <InfoComponent
                size="sm"
                message="Hay más registros disponibles. Al final de la página encontrará la opción para cargar más datos."
              />
            </div>
          )}

          <DiagramEmployeeView
            employeesData={accumulatedEmployees}
            dateRange={viewRange}
            onDateRangeChange={setViewRange}
          />

          {hasMoreData && (
            <div className="flex justify-center mt-4 mb-8">
              <Button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                variant="outline"
                className="px-8"
              >
                {isLoadingMore ? 'Cargando más empleados...' : 'Cargar más empleados'}
              </Button>
            </div>
          )}
        </>
      ) : hasSearched && accumulatedEmployees.length === 0 ? (
        <div className="p-6 rounded-lg border text-center">
          <p>No se encontraron diagramas para los empleados seleccionados.</p>
        </div>
      ) : (
        <div className="p-6 rounded-lg border text-center">
          <p>Para mostrar diagramas debe aplicar al menos un filtro.</p>
        </div>
      )}
    </div>
  );
}
