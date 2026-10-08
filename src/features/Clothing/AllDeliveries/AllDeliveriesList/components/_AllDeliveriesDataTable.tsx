'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildDeliveryStatusFacetResult } from '@/features/Clothing/components/DeliveryStatusBadge';
import { deliveryStatusLabels } from '@/features/Clothing/lib/delivery-stock-where';
import { BulkDownloadBar } from '@/features/Clothing/pdf/BulkDownloadBar';
import { clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { clothing_delivery_type } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import {
  getAllDeliveriesForExport,
  getAllDeliveriesPaginated,
  getAllDeliveriesSingleFacet,
  type AllDeliveryListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';
import { DeliveryCard } from './DeliveryCard';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('_AllDeliveriesDataTable');

// ============================================================================
// TYPES
// ============================================================================

interface AllDeliveriesDataTableProps {
  data: AllDeliveryListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

// ============================================================================
// HELPERS — builders para reducir boilerplate en fetchFacet
// ============================================================================

function buildEnumFacetResult(
  enumValues: string[],
  labels: Record<string, string>,
  counts: Map<string, number>
): FacetResult {
  const options = enumValues.map((v) => ({
    value: v,
    label: labels[v] ?? v,
  }));
  return { options, counts };
}

function buildFkFacetResult(
  resolvedOptions: Array<{ id: string; name: string | null }> | undefined,
  counts: Map<string, number>
): FacetResult {
  const options = (resolvedOptions ?? []).map((o) => ({
    value: o.id,
    label: o.name ?? o.id,
  }));
  return { options, counts };
}

// ============================================================================
// DEFAULT VISIBLE FILTERS (max 3)
// ============================================================================

const DEFAULT_VISIBLE_FILTERS = ['delivered_at', 'employee_id', 'delivery_type'];

const MOBILE_PAGE_SIZE = 10;

// ============================================================================
// MOBILE CARD LIST
// ============================================================================

function MobileDeliveryList({
  initialData,
  initialTotal,
}: {
  initialData: AllDeliveryListItem[];
  initialTotal: number;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput.trim(), 500);
  const hasSearch = debouncedSearch.length > 0;
  // Pendiente: el usuario tipeó pero el debounce todavía no se aplicó
  const isDebouncing = searchInput.trim() !== debouncedSearch;

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    setPageIndex(0);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setPageIndex(0);
  }, []);

  const { data: result, isFetching } = useQuery({
    queryKey: ['all-deliveries-mobile', pageIndex, debouncedSearch],
    queryFn: () =>
      getAllDeliveriesPaginated({
        page: String(pageIndex + 1),
        pageSize: String(MOBILE_PAGE_SIZE),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      }),
    initialData: pageIndex === 0 && !debouncedSearch ? { data: initialData, total: initialTotal } : undefined,
    staleTime: 30_000,
  });

  const showSpinner = (isDebouncing || isFetching) && searchInput.length > 0;

  const items = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / MOBILE_PAGE_SIZE);
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < totalPages - 1;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        {showSpinner ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          type="search"
          inputMode="search"
          placeholder="Buscar por nombre del empleado..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-9"
          aria-label="Buscar entregas por nombre del empleado"
        />
        {searchInput && !showSpinner && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Counter */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {showSpinner ? (
          'Buscando…'
        ) : hasSearch ? (
          <>
            {total} resultado{total !== 1 ? 's' : ''} para{' '}
            <span className="font-medium text-foreground">&ldquo;{debouncedSearch}&rdquo;</span>
          </>
        ) : (
          <>
            {total} entrega{total !== 1 ? 's' : ''}
          </>
        )}
      </p>

      {/* Cards */}
      {items.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {hasSearch ? 'No se encontraron entregas con ese nombre' : 'No hay entregas registradas'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((delivery) => (
            <DeliveryCard key={delivery.id} delivery={delivery} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setPageIndex((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {pageIndex + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setPageIndex((p) => p + 1)}>
            Siguiente
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function _AllDeliveriesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: AllDeliveriesDataTableProps) {
  logger.debug('Rendering all deliveries table', { data: { totalRows } });

  const isMobile = useIsMobile();

  // ─── Mobile: card list with simple pagination ─────────────────────────────
  if (isMobile) {
    return <MobileDeliveryList initialData={data} initialTotal={totalRows} />;
  }

  // ─── Desktop: full DataTable ──────────────────────────────────────────────
  return (
    <DesktopDeliveriesTable
      data={data}
      totalRows={totalRows}
      searchParams={searchParams}
      tableId={tableId}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
    />
  );
}

// ============================================================================
// DESKTOP TABLE (extracted to avoid hooks running conditionally)
// ============================================================================

function DesktopDeliveriesTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: AllDeliveriesDataTableProps) {
  // ─── Client-side navigation ───────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getAllDeliveriesPaginated(params), []);

  // ─── Bulk download — selección cross-page ─────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearTrigger, setClearTrigger] = useState(0);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

  // ─── Lazy-load facets — factories ─────────────────────────────────────────

  const makeEnumFetchFacet = useCallback(
    (columnId: string, enumValues: string[], labels: Record<string, string>) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getAllDeliveriesSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildEnumFacetResult(enumValues, labels, result.counts);
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getAllDeliveriesSingleFacet(columnId, facetParams);
        if (!result) return { options: [], counts: new Map() };
        return buildFkFacetResult(result.resolvedOptions, result.counts);
      },
    []
  );

  const fetchStatusFacet = useCallback(async (facetParams: DataTableSearchParams): Promise<FacetResult> => {
    const result = await getAllDeliveriesSingleFacet('status', facetParams);
    return buildDeliveryStatusFacetResult(result?.counts ?? new Map());
  }, []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(), []);

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'delivered_at',
        title: 'Fecha de entrega',
        type: 'dateRange' as const,
      },
      {
        columnId: 'employee_file',
        title: 'Legajo (destinatario)',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
      {
        columnId: 'employee_id',
        title: 'Destinatario',
        fetchFacet: makeFkFetchFacet('employee_id'),
      },
      {
        columnId: 'delivery_type',
        title: 'Tipo de entrega',
        fetchFacet: makeEnumFetchFacet(
          'delivery_type',
          Object.values(clothing_delivery_type),
          clothingDeliveryTypeLabels
        ),
      },
      {
        columnId: 'delivered_by_file',
        title: 'Legajo (entregó)',
        type: 'text' as const,
        placeholder: 'Buscar por legajo...',
      },
      {
        columnId: 'delivered_by_id',
        title: 'Entregado por',
        fetchFacet: makeFkFetchFacet('delivered_by_id'),
      },
      {
        columnId: 'has_signature',
        title: 'Firma',
        fetchFacet: async (): Promise<FacetResult> => {
          const trueCount = data.filter((d) => d.signature_url != null).length;
          const falseCount = data.filter((d) => d.signature_url == null).length;
          const counts = new Map<string, number>();
          if (trueCount > 0) counts.set('true', trueCount);
          if (falseCount > 0) counts.set('false', falseCount);
          return {
            options: [
              { value: 'true', label: 'Con firma' },
              { value: 'false', label: 'Sin firma' },
            ],
            counts,
          };
        },
      },
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: fetchStatusFacet,
      },
      {
        columnId: 'notes',
        title: 'Notas',
        type: 'text' as const,
        placeholder: 'Buscar en notas...',
      },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, fetchStatusFacet, data]
  );

  // ─── Filter visibility (max 3 by default) ────────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ─── Column visibility ────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((col) => [col, false]));
    return { ...defaults, ...(initialColumnVisibility ?? {}) };
  }, [initialColumnVisibility]);

  // ─── Export config ────────────────────────────────────────────────────────
  const exportConfig = useMemo(
    () => ({
      fetchAllData: () => getAllDeliveriesForExport(currentParams),
      options: {
        filename: 'todas-entregas-indumentaria',
        sheetName: 'Entregas',
        title: 'Todas las Entregas de Indumentaria',
      },
      formatters: {
        delivered_at: (val: unknown) => (val ? moment(val as Date).format('DD/MM/YYYY') : '-'),
        delivery_type: (val: unknown) =>
          val ? clothingDeliveryTypeLabels[val as keyof typeof clothingDeliveryTypeLabels] ?? String(val) : '-',
        has_signature: (val: unknown) => (val === 'true' ? 'Sí' : 'No'),
        status: (val: unknown) => deliveryStatusLabels[String(val)] ?? '-',
        delivered_by_file: (val: unknown) => (val != null ? String(val) : '-'),
        employee_file: (val: unknown) => (val != null ? String(val) : '-'),
      },
    }),
    [currentParams]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        paramNamespace={tableId}
        tableId={tableId}
        queryFn={tableQueryFn}
        queryKey={['all-deliveries']}
        onStateChange={handleStateChange}
        facetedFilters={facetedFilters}
        initialFilterVisibility={mergedFilterVisibility}
        initialColumnVisibility={mergedColumnVisibility}
        searchPlaceholder="Buscar por nombre del empleado o notas..."
        showFilterToggle={true}
        showSearch={true}
        emptyMessage="No hay entregas registradas"
        exportConfig={exportConfig}
        enableRowSelection
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        clearSelectionTrigger={clearTrigger}
      />
      <BulkDownloadBar selectedIds={selectedIds} onClear={clearSelection} />
    </>
  );
}
