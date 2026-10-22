'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeliveriesTable } from '@/features/Clothing/components/DeliveriesTable';
import { deliveryStatusOptions } from '@/features/Clothing/components/DeliveryStatusBadge';
import {
  DELIVERY_EXPORT_FORMATTERS,
  deliveryTypeOptions,
  formatFileForExport,
  signatureFilterFromRows,
} from '@/features/Clothing/lib/delivery-table-config';
import { Logger } from '@/lib/logger';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
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

const facets = createFacetFilters(getAllDeliveriesSingleFacet);

function DesktopDeliveriesTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: AllDeliveriesDataTableProps) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getAllDeliveriesPaginated(params), []);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo(() => getColumns(), []);

  // ─── Faceted filters ──────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      dateRangeFilter('delivered_at', 'Fecha de entrega'),
      textFilter('employee_file', 'Legajo (destinatario)', 'Buscar por legajo...'),
      facets.lookup('employee_id', 'Destinatario'),
      facets.fixed('delivery_type', 'Tipo de entrega', deliveryTypeOptions),
      textFilter('delivered_by_file', 'Legajo (entregó)', 'Buscar por legajo...'),
      facets.lookup('delivered_by_id', 'Entregado por'),
      signatureFilterFromRows(data),
      facets.fixed('status', 'Estado', deliveryStatusOptions),
      textFilter('notes', 'Notas', 'Buscar en notas...'),
    ],
    [data]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

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
        ...DELIVERY_EXPORT_FORMATTERS,
        delivered_by_file: formatFileForExport,
        employee_file: formatFileForExport,
      },
    }),
    [currentParams]
  );

  return (
    <DeliveriesTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={['all-deliveries']}
      searchPlaceholder="Buscar por nombre del empleado o notas..."
      emptyMessage="No hay entregas registradas"
      exportConfig={exportConfig}
    />
  );
}
