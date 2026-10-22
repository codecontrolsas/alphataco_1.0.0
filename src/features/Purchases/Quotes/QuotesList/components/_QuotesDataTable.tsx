'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableExportConfig, type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { FileText, Truck, User } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PURCHASES_QUERY_KEYS } from '../../../lib/query-keys';
import {
  PURCHASE_QUOTE_STATUSES,
  PURCHASE_QUOTE_STATUS_LABELS,
  type PurchaseQuoteStatus,
} from '../../../lib/quote-state-machine';
import { purchaseQuoteStatusIcons } from '../../components/PurchaseQuoteStatusBadge';
import {
  getAllPurchaseQuotesForExport,
  getPurchaseQuoteSingleFacet,
  getPurchaseQuotesPaginated,
  type PurchaseQuoteListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: PurchaseQuoteListItem[];
  totalRows: number;
  /** `compras:cotizaciones:view_prices`, resuelto en el servidor (el servidor enmascara por su cuenta). */
  canViewPrices: boolean;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Banda de atencion resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['status', 'supplier', 'created_at'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

export function _QuotesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canViewPrices,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseQuotesPaginated(params), []);

  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseQuoteSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: PURCHASE_QUOTE_STATUSES.map((value) => ({
              value,
              label: PURCHASE_QUOTE_STATUS_LABELS[value],
              icon: purchaseQuoteStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'supplier',
        title: 'Proveedor',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseQuoteSingleFacet('supplier', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Truck })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'sent_at', title: 'Enviada', type: 'dateRange' as const },
      { columnId: 'received_at', title: 'Respondida', type: 'dateRange' as const },
      { columnId: 'valid_until', title: 'Validez', type: 'dateRange' as const },
      {
        columnId: 'requests',
        title: 'Solicitudes de origen',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseQuoteSingleFacet('requests', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: FileText })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'creator',
        title: 'Creó',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getPurchaseQuoteSingleFacet('creator', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: User })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<PurchaseQuoteListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseQuotesForExport(currentParams)),
      options: { filename: 'pedidos-de-cotizacion', title: 'Pedidos de cotización', sheetName: 'Cotizaciones' },
      formatters: {
        status: (value) => PURCHASE_QUOTE_STATUS_LABELS[value as PurchaseQuoteStatus] ?? String(value),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        sent_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        received_at: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : ''),
        valid_until: (value) => (value ? moment.utc(value as string | Date).format('DD/MM/YYYY') : ''),
        total_quoted: (value) => (!canViewPrices ? 'Sin permiso' : value ? formatMoney(String(value)) : ''),
      },
    }),
    [currentParams, canViewPrices]
  );

  return (
    <div className="space-y-4">
      {topSlot}
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.quotes]}
        onStateChange={handleStateChange}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay pedidos de cotización"
        exportConfig={exportConfig}
        data-testid="purchase-quotes-table"
      />
    </div>
  );
}
