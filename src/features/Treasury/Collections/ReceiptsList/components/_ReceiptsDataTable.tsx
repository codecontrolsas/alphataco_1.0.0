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
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Users } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { RECEIPT_STATUS_LABELS } from '../../../lib/receipt-rules';
import {
  getAllReceiptsForExport,
  getReceiptSingleFacet,
  getReceiptsPaginated,
  type ReceiptListItem,
} from '../actions.server';
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

const SENT_VALUES = Object.keys(SENT_LABELS) as SentValue[];

const facets = createFacetFilters(getReceiptSingleFacet);

export function _ReceiptsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getReceiptsPaginated(params), []);

  const columns = useMemo(() => getColumns(), []);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('customer', 'Cliente', Users),
      facets.fixed(
        'status',
        'Estado',
        RECEIPT_STATUS_VALUES.map((value) => ({
          value,
          label: RECEIPT_STATUS_LABELS[value],
          icon: receiptStatusIcons[value],
        }))
      ),
      { columnId: 'date', title: 'Fecha', type: 'dateRange' as const },
      facets.fixed(
        'sent',
        'Enviado',
        SENT_VALUES.map((value) => ({ value, label: SENT_LABELS[value], icon: sentIcons[value] }))
      ),
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Número, ej: RE-000001' },
      { columnId: 'invoices_count', title: 'Comprobantes', type: 'text' as const, placeholder: 'Cantidad exacta' },
      {
        columnId: 'withholdings_total',
        title: 'Retenciones',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
      {
        columnId: 'received_total',
        title: 'Total recibido',
        type: 'text' as const,
        placeholder: 'Importe exacto, ej: 1234,56',
      },
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

  const exportConfig: DataTableExportConfig<ReceiptListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllReceiptsForExport(currentParams)),
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
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...TREASURY_QUERY_KEYS.receipts]}
      searchPlaceholder="Buscar por número o cliente"
      emptyMessage="No hay recibos"
      exportConfig={exportConfig}
      data-testid="treasury-receipts-table"
    />
  );
}
