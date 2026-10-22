'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters } from '@/shared/components/common/DataTable/facet-filters';
import {
  type DataTableExportConfig,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Banknote, Users } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { formatInCurrency } from '../../../lib/currency-format';
import { TREASURY_QUERY_KEYS } from '../../../lib/query-keys';
import { RECEIVABLE_STATE_LABELS, type ReceivableState } from '../../../lib/receipt-rules';
import {
  getAllReceivablesForExport,
  getReceivableSingleFacet,
  getReceivablesPaginated,
  type ReceivableListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatValueDate, getColumns, receivableStateIcons } from '../columns';
import { NO_DUE_DATE_LABEL, RECEIVABLE_CURRENCIES } from '../constants';

interface Props {
  data: ReceivableListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  canCollect: boolean;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const DEFAULT_VISIBLE_FILTERS = ['customer', 'currency', 'state'];

const STATE_VALUES = Object.keys(RECEIVABLE_STATE_LABELS) as ReceivableState[];

const facets = createFacetFilters(getReceivableSingleFacet);

export function _ReceivablesDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  canCollect,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getReceivablesPaginated(params), []);

  const columns = useMemo(() => getColumns({ canCollect }), [canCollect]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.lookup('customer', 'Cliente', Users),
      facets.fixed(
        'currency',
        'Moneda',
        RECEIVABLE_CURRENCIES.map((value) => ({ value, label: value, icon: Banknote }))
      ),
      facets.fixed(
        'state',
        'Estado',
        STATE_VALUES.map((value) => ({
          value,
          label: RECEIVABLE_STATE_LABELS[value],
          icon: receivableStateIcons[value],
        }))
      ),
      { columnId: 'issue_date', title: 'Fecha', type: 'dateRange' as const },
      { columnId: 'due_date', title: 'Vencimiento', type: 'dateRange' as const },
      { columnId: 'voucher', title: 'Comprobante', type: 'text' as const, placeholder: 'Ej: Factura A 00003-00000124' },
      { columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      { columnId: 'pending', title: 'Pendiente', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' },
      {
        columnId: 'overdue_days',
        title: 'Días de atraso',
        type: 'text' as const,
        placeholder: 'Cantidad exacta de días',
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

  const exportConfig: DataTableExportConfig<ReceivableListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllReceivablesForExport(currentParams)),
      options: { filename: 'a-cobrar', title: 'A cobrar', sheetName: 'A cobrar' },
      formatters: {
        issue_date: (value) => formatValueDate(value as string),
        due_date: (value) => (value ? formatValueDate(value as string) : NO_DUE_DATE_LABEL),
        // Los importes salen con su moneda, igual que en pantalla
        total: (value, row) => formatInCurrency(String(value), row.currency),
        pending: (value, row) => formatInCurrency(String(value), row.currency),
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
      queryKey={[...TREASURY_QUERY_KEYS.receivables]}
      searchPlaceholder="Buscar por cliente o comprobante"
      emptyMessage="No hay comprobantes pendientes de cobro"
      exportConfig={exportConfig}
      data-testid="treasury-receivables-table"
    />
  );
}
