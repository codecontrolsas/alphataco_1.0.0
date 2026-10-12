'use client';

import { formatMoney } from '@/features/Warehouses/lib/format';
import {
  DataTable,
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { RECEIPT_STATUS_LABELS } from '../../../lib/receipt-rules';
import { getAllReceiptsForExport, getReceiptSingleFacet, getReceiptsPaginated, type ReceiptListItem } from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatValueDate, getColumns, receiptStatusIcons, sentIcons } from '../columns';
import { RECEIPT_STATUS_VALUES, SENT_LABELS, type SentValue } from '../constants';

interface Props {
  data: ReceiptListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['customer', 'status', 'date'];

const EMPTY_FACET: FacetResult = { options: [], counts: new Map() };

const SENT_VALUES = Object.keys(SENT_LABELS) as SentValue[];

export function _ReceiptsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getReceiptsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const mergedColumnVisibility = useMemo(() => {
    const defaults = Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((c) => [c, false]));
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'customer',
        title: 'Cliente',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceiptSingleFacet('customer', params);
          if (!result) return EMPTY_FACET;
          return {
            options: (result.resolvedOptions ?? []).map((o) => ({ value: o.id, label: o.name ?? '', icon: Users })),
            counts: result.counts,
          };
        },
      },
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceiptSingleFacet('status', params);
          if (!result) return EMPTY_FACET;
          return {
            options: RECEIPT_STATUS_VALUES.map((value) => ({
              value,
              label: RECEIPT_STATUS_LABELS[value],
              icon: receiptStatusIcons[value],
            })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      {
        columnId: 'sent',
        title: 'Enviado',
        fetchFacet: async (params: DataTableSearchParams): Promise<FacetResult> => {
          const result = await getReceiptSingleFacet('sent', params);
          if (!result) return EMPTY_FACET;
          return {
            options: SENT_VALUES.map((value) => ({ value, label: SENT_LABELS[value], icon: sentIcons[value] })),
            counts: result.counts,
          };
        },
      },
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Número, ej: RE-000001' },
      { columnId: 'invoices_count', title: 'Comprobantes', type: 'text' as const, placeholder: 'Cantidad exacta' },
      { columnId: 'withholdings_total', title: 'Retenciones', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'received_total', title: 'Total recibido', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
    ],
    []
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) return initialFilterVisibility;
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  const exportConfig: DataTableExportConfig<ReceiptListItem> = useMemo(
    () => ({
      fetchAllData: () => getAllReceiptsForExport(currentParams),
      options: { filename: 'recibos-cobranza', title: 'Recibos', sheetName: 'Recibos' },
      formatters: {
        date: (value) => formatValueDate(value as string),
        withholdings_total: (value) => formatMoney(String(value)),
        received_total: (value) => formatMoney(String(value)),
      },
    }),
    [currentParams]
  );

  return (
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
      queryKey={[...TREASURY_QUERY_KEYS.receipts]}
      onStateChange={handleStateChange}
      searchPlaceholder="Buscar por número o cliente"
      emptyMessage="No hay recibos"
      exportConfig={exportConfig}
      data-testid="treasury-receipts-table"
    />
  );
}
