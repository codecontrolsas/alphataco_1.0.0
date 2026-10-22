'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { FileText, Truck, User } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
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

const facets = createFacetFilters(getPurchaseQuoteSingleFacet);

const STATUS_OPTIONS = PURCHASE_QUOTE_STATUSES.map((value) => ({
  value,
  label: PURCHASE_QUOTE_STATUS_LABELS[value],
  icon: purchaseQuoteStatusIcons[value],
}));

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
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getPurchaseQuotesPaginated(params), []);

  const columns = useMemo(() => getColumns({ canViewPrices }), [canViewPrices]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed('status', 'Estado', STATUS_OPTIONS),
      facets.lookup('supplier', 'Proveedor', Truck),
      { columnId: 'created_at', title: 'Fecha de alta', type: 'dateRange' as const },
      { columnId: 'sent_at', title: 'Enviada', type: 'dateRange' as const },
      { columnId: 'received_at', title: 'Respondida', type: 'dateRange' as const },
      { columnId: 'valid_until', title: 'Validez', type: 'dateRange' as const },
      facets.lookup('requests', 'Solicitudes de origen', FileText),
      facets.lookup('creator', 'Creó', User),
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Buscar por número...' },
    ],
    []
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

  const exportConfig: DataTableExportConfig<PurchaseQuoteListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllPurchaseQuotesForExport(currentParams)),
      options: { filename: 'pedidos-de-cotizacion', title: 'Pedidos de cotización', sheetName: 'Cotizaciones' },
      formatters: {
        status: (value) => PURCHASE_QUOTE_STATUS_LABELS[value as PurchaseQuoteStatus] ?? String(value),
        created_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        sent_at: (value) => (value ? formatArgentinaDay(value as string | Date) : ''),
        received_at: (value) => (value ? formatDateOnlyAr(value as string | Date) : ''),
        valid_until: (value) => (value ? formatDateOnlyAr(value as string | Date) : ''),
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
        {...tableProps}
        queryFn={tableQueryFn}
        queryKey={[...PURCHASES_QUERY_KEYS.quotes]}
        searchPlaceholder="Buscar por número o proveedor"
        emptyMessage="No hay pedidos de cotización"
        exportConfig={exportConfig}
        data-testid="purchase-quotes-table"
      />
    </div>
  );
}
